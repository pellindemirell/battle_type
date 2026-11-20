using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.SignalR;
using TypingApp.Api.Services;

namespace TypingApp.Api.Hubs;

public class TypingHub : Hub
{
    private static readonly TimeSpan MinimumKeyPressInterval =
        TimeSpan.FromMilliseconds(20);

    private static readonly object LastChatMessageKey = new();
    private static readonly HashSet<string> ChatEmoteIds = Enumerable.Range(1, 20)
        .Select(id => id.ToString("00", CultureInfo.InvariantCulture))
        .ToHashSet(StringComparer.Ordinal);
    private readonly RaceRoomStore _rooms;
    private readonly WordSelector _wordSelector;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<TypingHub>? _logger;

    public TypingHub(
        RaceRoomStore rooms,
        WordSelector wordSelector,
        TimeProvider timeProvider,
        ILogger<TypingHub>? logger = null)
    {
        _rooms = rooms;
        _wordSelector = wordSelector;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public Task<string> CreateRoom(
        string? difficulty,
        int wordCount,
        string? characterMode,
        string? playerName) =>
        CreateRoomWithProfile(difficulty, wordCount, characterMode, playerName, null);

    public async Task<string> CreateRoomWithProfile(
        string? difficulty,
        int wordCount,
        string? characterMode,
        string? playerName,
        string? avatarId)
    {
        var normalizedPlayerName = NormalizePlayerName(playerName);
        var normalizedAvatarId = NormalizeAvatarId(avatarId);

        var settings = ParseRoomSettings(difficulty, wordCount, characterMode);

        var text = _wordSelector.BuildText(
            settings.Level,
            settings.WordCount,
            settings.SimplifyTurkish);
        string roomCode;
        RoomState room;

        do
        {
            roomCode = Guid.NewGuid().ToString("N")[..5].ToUpperInvariant();
            room = new RoomState
            {
                Code = roomCode,
                Text = text,
                Settings = settings,
                LastActivityAt = _timeProvider.GetUtcNow()
            };
            room.Players.Add(Context.ConnectionId, new PlayerState
            {
                Name = normalizedPlayerName,
                AvatarId = normalizedAvatarId
            });
        }
        while (!_rooms.TryAdd(room));

        await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);
        await Clients.Caller.SendAsync(
            "RoomCreated",
            new
            {
                roomCode,
                playerName = normalizedPlayerName,
                avatarId = normalizedAvatarId,
                settings = BuildRoomSettings(room.Settings)
            });

        return roomCode;
    }

    public Task JoinRoom(string? roomCode, string? playerName) =>
        JoinRoomWithProfile(roomCode, playerName, null);

    public async Task JoinRoomWithProfile(string? roomCode, string? playerName, string? avatarId)
    {
        var room = GetRoom(roomCode);
        var connectionId = Context.ConnectionId;
        var normalizedPlayerName = NormalizePlayerName(playerName);
        var normalizedAvatarId = NormalizeAvatarId(avatarId);
        RacePlayerProgress[] progress;

        lock (room.Lock)
        {
            if (!_rooms.TryGet(room.Code, out var currentRoom) || !ReferenceEquals(currentRoom, room))
                throw new HubException("Oda bulunamadı.");
            if (room.Phase != RacePhase.Waiting)
                throw new HubException("Yarışma zaten başladı veya tamamlandı.");

            if (room.Players.ContainsKey(connectionId))
                throw new HubException("Bu oyuncu zaten odada.");

            if (room.Players.Count >= 2)
                throw new HubException("Oda zaten dolu.");

            room.Players.Add(connectionId, new PlayerState
            {
                Name = normalizedPlayerName,
                AvatarId = normalizedAvatarId
            });
            progress = BuildProgress(room);
        }

        await Groups.AddToGroupAsync(connectionId, room.Code);
        await Clients.Group(room.Code).SendAsync(
            "PlayerJoined",
            new
            {
                roomCode = room.Code,
                players = progress,
                settings = BuildRoomSettings(room.Settings)
            });
        await SendReadyChanged(room);
    }

    public Task SetReady(string? roomCode) => Ready(roomCode, true);

    public async Task Ready(string? roomId, bool ready)
    {
        var room = GetRoom(roomId);
        var group = Clients.Group(room.Code);
        Task update;
        Task? countdown = null;

        lock (room.Lock)
        {
            if (!room.Players.TryGetValue(Context.ConnectionId, out var player))
                throw new HubException("Bu yarışmanın oyuncusu değilsin.");

            if (room.Players.Count != 2)
                throw new HubException("Rakip katılınca hazır olabilirsin.");

            if (room.SettingsProposal is not null)
                throw new HubException("Oda ayarları onay bekliyor.");

            if (room.Phase != RacePhase.Waiting && !(room.Phase == RacePhase.Countdown && !ready))
                throw new HubException("Bu yarışma şu anda hazır duruma alınamaz.");

            player.Ready = ready;
            Task? canceled = null;
            if (room.Phase == RacePhase.Countdown)
            {
                CancelCountdown(room);
                canceled = group.SendAsync("CountdownCanceled");
            }

            update = group.SendAsync("ReadyChanged", BuildReadyPlayers(room));
            if (canceled is not null)
                update = Task.WhenAll(canceled, update);
            if (ready && room.Players.Values.All(candidate => candidate.Ready))
                countdown = StartCountdown(room, group);
        }

        await update;
        if (countdown is not null)
            await countdown;
    }

    public async Task ProposeRoomSettings(string? roomId, string? difficulty, int wordCount, string? characterMode)
    {
        var room = GetRoom(roomId);
        var settings = ParseRoomSettings(difficulty, wordCount, characterMode);
        var group = Clients.Group(room.Code);
        Task notification;
        lock (room.Lock)
        {
            if (!room.Players.TryGetValue(Context.ConnectionId, out var player)
                || room.Phase != RacePhase.Waiting || room.SettingsProposal is not null)
                throw new HubException("Oda ayarları şu anda değiştirilemez.");
            if (room.Settings == settings)
                throw new HubException("Oda ayarları zaten güncel.");
            room.LastActivityAt = _timeProvider.GetUtcNow();

            if (room.Players.Count == 1)
            {
                ResetRound(room, settings);
                notification = SendSettingsResolution(group, settings);
            }
            else
            {
                var proposal = room.SettingsProposal = new RoomSettingsProposal(Guid.NewGuid(), Context.ConnectionId, settings);
                notification = group.SendAsync("RoomSettingsProposed", new
                {
                    proposal.Id,
                    proposal.FromId,
                    fromName = player.Name,
                    settings = BuildRoomSettings(settings)
                });
            }
        }
        await notification;
    }

    public async Task RespondRoomSettings(string? roomId, Guid proposalId, bool accept)
    {
        var room = GetRoom(roomId);
        var group = Clients.Group(room.Code);
        Task notification;
        lock (room.Lock)
        {
            var proposal = room.SettingsProposal;
            if (!room.Players.ContainsKey(Context.ConnectionId) || room.Phase != RacePhase.Waiting
                || proposal is null || proposal.Id != proposalId || (accept && proposal.FromId == Context.ConnectionId))
                throw new HubException("Bu ayar isteği artık yanıtlanamaz.");

            if (accept)
                ResetRound(room, proposal.Settings);
            room.SettingsProposal = null;
            room.LastActivityAt = _timeProvider.GetUtcNow();
            notification = SendSettingsResolution(group, accept ? proposal.Settings : null);
        }
        await notification;
    }

    private static Task SendSettingsResolution(IClientProxy group, RoomSettings? settings) =>
        group.SendAsync("RoomSettingsResolved", settings is null ? null : BuildRoomSettings(settings));

    public async Task RequestRematch(string? roomId, int rounds)
    {
        if (rounds is not (1 or 3 or 5))
            throw new HubException("Tur sayısı 1, 3 veya 5 olmalı.");

        var room = GetRoom(roomId);
        var group = Clients.Group(room.Code);
        Task announcement;
        lock (room.Lock)
        {
            var player = RequireRematchPlayer(room);
            if (room.Rematch is not null)
                throw new HubException("Zaten bekleyen bir rövanş isteği var.");

            var request = room.Rematch = new PendingRematch(
                Context.ConnectionId, rounds, _timeProvider.GetUtcNow().AddSeconds(30));
            announcement = group.SendAsync("RematchRequested", new
            {
                fromId = request.FromId,
                fromName = player.Name,
                request.Rounds
            });
            _ = ExpireRematch(room, group, request, announcement);
        }
        await announcement;
    }

    public Task RespondRematch(string? roomId, bool accept) => ResolveRematch(roomId, accept, false);

    public Task CancelRematch(string? roomId) => ResolveRematch(roomId, false, true);

    private async Task ResolveRematch(string? roomId, bool accept, bool cancel)
    {
        var room = GetRoom(roomId);
        var group = Clients.Group(room.Code);
        Task notification;
        lock (room.Lock)
        {
            RequireRematchPlayer(room);
            var request = room.Rematch ?? throw new HubException("Bekleyen bir rövanş isteği yok.");
            if ((request.FromId == Context.ConnectionId) != cancel)
                throw new HubException("Bu rövanş isteğini yalnızca ilgili oyuncu yanıtlayabilir.");

            if (request.ExpiresAt <= _timeProvider.GetUtcNow())
                notification = DeclineRematch(room, group, "expired");
            else if (!accept)
                notification = DeclineRematch(room, group, cancel ? "canceled" : "rejected");
            else
            {
                ClearRematch(room);
                room.Series = new RaceSeriesState(request.Rounds, room.Players.Keys);
                ResetRound(room);
                notification = group.SendAsync("RematchAccepted", new { series = room.Series.Snapshot() });
            }
        }
        await notification;
    }

    private PlayerState RequireRematchPlayer(RoomState room)
    {
        if (!room.Players.TryGetValue(Context.ConnectionId, out var player))
            throw new HubException("Bu odanın oyuncusu değilsin.");
        if (room.Phase != RacePhase.Finished || room.Players.Count != 2)
            throw new HubException("Rövanş için bitmiş bir yarış ve iki oyuncu gerekli.");
        return player;
    }

    private async Task ExpireRematch(RoomState room, IClientProxy group, PendingRematch request, Task announcement)
    {
        try
        {
            await announcement;
            var remaining = request.ExpiresAt - _timeProvider.GetUtcNow();
            if (remaining > TimeSpan.Zero)
                await Task.Delay(remaining, _timeProvider, request.Cancellation.Token);

            Task notification;
            lock (room.Lock)
            {
                if (!ReferenceEquals(room.Rematch, request))
                    return;
                notification = DeclineRematch(room, group, "expired");
            }
            await notification;
        }
        catch (OperationCanceledException) when (request.Cancellation.IsCancellationRequested)
        {
        }
        catch (Exception error)
        {
            _logger?.LogError(error, "Rövanş bildirimi gönderilemedi.");
        }
        finally
        {
            lock (room.Lock)
                if (ReferenceEquals(room.Rematch, request))
                    room.Rematch = null;
            request.Cancellation.Dispose();
        }
    }

    private static Task DeclineRematch(RoomState room, IClientProxy group, string reason)
    {
        ClearRematch(room);
        return group.SendAsync("RematchDeclined", new { reason });
    }

    private static void ClearRematch(RoomState room)
    {
        var request = room.Rematch;
        room.Rematch = null;
        request?.Cancellation.Cancel();
    }

    private void ResetRound(RoomState room, RoomSettings? nextSettings = null)
    {
        var settings = nextSettings ?? room.Settings;
        room.Text = _wordSelector.BuildText(settings.Level, settings.WordCount, settings.SimplifyTurkish);
        room.Settings = settings;
        room.StartedAt = null;
        room.Finished = false;
        room.Phase = RacePhase.Waiting;
        foreach (var player in room.Players.Values)
        {
            player.Position = 0;
            player.Errors = 0;
            player.Keystrokes = 0;
            player.LastKeyAt = null;
            player.FinishedAt = null;
            player.Ready = false;
            player.MissedKeys.Clear();
        }
    }

    private static RaceResult FinishRound(
        RoomState room, string winnerId, DateTime now,
        KeyValuePair<string, PlayerState>? disconnected = null)
    {
        room.Finished = true;
        room.Phase = RacePhase.Finished;
        foreach (var player in room.Players.Values)
            player.Ready = false;

        if (room.Series is { } series)
        {
            series.Wins[winnerId]++;
            if (disconnected is not null)
                series.WinnerId = winnerId;
            else if (series.Current == series.Total)
                series.WinnerId = series.Wins.MaxBy(pair => pair.Value).Key;
        }

        return BuildResult(room, winnerId, now, disconnected) with { Series = room.Series?.Snapshot() };
    }

    // The invocation returns after announcing the countdown so the same client can cancel it.
    private Task StartCountdown(RoomState room, IClientProxy group)
    {
        room.Phase = RacePhase.Countdown;
        var countdown = room.CountdownCancellation = new CancellationTokenSource();
        var announcement = group.SendAsync("CountdownStarted", 3);
        _ = CompleteCountdown(room, group, countdown, announcement);
        return announcement;
    }

    private async Task CompleteCountdown(
        RoomState room, IClientProxy group, CancellationTokenSource countdown, Task announcement)
    {
        try
        {
            await announcement;
            await Task.Delay(TimeSpan.FromSeconds(3), _timeProvider, countdown.Token);

            Task start;
            lock (room.Lock)
            {
                if (!ReferenceEquals(room.CountdownCancellation, countdown))
                    return;

                room.StartedAt = _timeProvider.GetUtcNow().UtcDateTime;
                room.Phase = RacePhase.Running;
                room.CountdownCancellation = null;
                start = group.SendAsync("RaceStarted", new { text = room.Text });
            }
            await start;
        }
        catch (OperationCanceledException) when (countdown.IsCancellationRequested)
        {
        }
        catch (Exception error)
        {
            _logger?.LogError(error, "Yarış geri sayımı tamamlanamadı.");
        }
        finally
        {
            lock (room.Lock)
            {
                if (ReferenceEquals(room.CountdownCancellation, countdown))
                {
                    room.CountdownCancellation = null;
                    room.Phase = RacePhase.Waiting;
                    foreach (var player in room.Players.Values)
                        player.Ready = false;
                }
            }
            countdown.Dispose();
        }
    }

    private static void CancelCountdown(RoomState room)
    {
        var countdown = room.CountdownCancellation;
        room.CountdownCancellation = null;
        room.Phase = RacePhase.Waiting;
        countdown?.Cancel();
    }

    private Task SendReadyChanged(RoomState room)
    {
        lock (room.Lock)
            return Clients.Group(room.Code).SendAsync("ReadyChanged", BuildReadyPlayers(room));
    }

    private static object[] BuildReadyPlayers(RoomState room) =>
        room.Players.Select(entry => (object)new
        {
            id = entry.Key,
            name = entry.Value.Name,
            avatarId = entry.Value.AvatarId,
            ready = entry.Value.Ready
        }).ToArray();

    public Task<RaceChatMessage> SendMessage(string? roomId, string? text)
    {
        text = text?.Trim();
        if (string.IsNullOrEmpty(text) || text.EnumerateRunes().Skip(140).Any())
            throw new HubException("Mesaj 1–140 karakter olmalı.");

        return SendChat(roomId, text);
    }

    public Task<RaceChatMessage> SendEmote(string? roomId, string? emoteId)
    {
        if (emoteId is null || !ChatEmoteIds.Contains(emoteId))
            throw new HubException("Geçersiz emoji.");

        return SendChat(roomId, "", emoteId);
    }

    private async Task<RaceChatMessage> SendChat(string? roomId, string text, string? emoteId = null)
    {
        var room = GetRoom(roomId);
        RaceChatMessage message;
        lock (room.Lock)
        {
            if (!room.Players.TryGetValue(Context.ConnectionId, out var player))
                throw new HubException("Bu odanın oyuncusu değilsin.");
            if (room.Phase is not (RacePhase.Waiting or RacePhase.Finished))
                throw new HubException("Oyun sırasında mesaj gönderilemez.");

            var now = _timeProvider.GetUtcNow();
            lock (Context.Items)
            {
                if (Context.Items.TryGetValue(LastChatMessageKey, out var last) &&
                    last is DateTimeOffset sentAt && now - sentAt < TimeSpan.FromSeconds(3))
                    throw new HubException("Mesaj göndermek için 3 saniye bekle.");
                Context.Items[LastChatMessageKey] = now;
            }

            message = new RaceChatMessage(player.Name, text, now)
            {
                EmoteId = emoteId,
                AvatarId = emoteId is null ? null : player.AvatarId
            };
        }

        await Clients.OthersInGroup(room.Code).SendAsync("MessageReceived", message);
        return message;
    }

    public async Task KeyPress(string? roomCode, string? key)
    {
        var room = GetRoom(roomCode);
        if (string.IsNullOrEmpty(key) || key.Length != 1)
            return;

        RacePlayerProgress[] progress;
        RaceResult? result = null;
        RaceSeriesSnapshot? nextRound = null;
        var timestamp = _timeProvider.GetUtcNow();
        var now = timestamp.UtcDateTime;

        lock (room.Lock)
        {
            if (room.Phase != RacePhase.Running || room.StartedAt is null)
                return;

            if (!room.Players.TryGetValue(Context.ConnectionId, out var player))
                throw new HubException("Bu yarışmanın oyuncusu değilsin.");

            if (player.FinishedAt is not null)
                return;

            if (player.LastKeyAt is { } lastKeyAt &&
                timestamp - lastKeyAt < MinimumKeyPressInterval)
            {
                return;
            }

            player.LastKeyAt = timestamp;
            player.Keystrokes++;

            if (string.Equals(
                    key,
                    room.Text[player.Position].ToString(),
                    StringComparison.Ordinal))
            {
                player.Position++;
                if (player.Position == room.Text.Length)
                {
                    player.FinishedAt = now;
                    result = FinishRound(room, Context.ConnectionId, now);
                }
            }
            else
            {
                player.Errors++;
                var expectedKey = room.Text[player.Position];
                player.MissedKeys[expectedKey] =
                    player.MissedKeys.GetValueOrDefault(expectedKey) + 1;
            }

            progress = BuildProgress(room, now);
            if (result?.Series is { WinnerId: null } && room.Series is { } series)
            {
                series.Current++;
                ResetRound(room);
                nextRound = series.Snapshot();
            }
        }

        var group = Clients.Group(room.Code);
        await group.SendAsync("ProgressUpdated", progress);
        if (result is not null)
            await group.SendAsync("RaceFinished", result);
        if (nextRound is not null)
            await group.SendAsync("RoundPrepared", new { series = nextRound });
    }

    public Task LeaveRoom(string? roomId) =>
        roomId is not null && _rooms.TryGet(roomId.Trim(), out var room) && room is not null
            ? RemovePlayerFromRoom(room, voluntary: true)
            : Task.CompletedTask;

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        foreach (var entry in _rooms.Snapshot())
            await RemovePlayerFromRoom(entry.Value, voluntary: false);

        await base.OnDisconnectedAsync(exception);
    }

    private async Task RemovePlayerFromRoom(RoomState room, bool voluntary)
    {
        var group = Clients.Group(room.Code);
        var notifications = new List<Task>();
        lock (room.Lock)
        {
            if (!room.Players.Remove(Context.ConnectionId, out var leavingPlayer))
                return;

            if (room.Players.Count == 0)
            {
                room.CountdownCancellation?.Cancel();
                ClearRematch(room);
                _rooms.TryRemove(room.Code);
            }
            else
            {
                var now = _timeProvider.GetUtcNow();
                room.LastActivityAt = now;
                if (room.SettingsProposal is not null)
                {
                    room.SettingsProposal = null;
                    notifications.Add(SendSettingsResolution(group, null));
                }
                if (room.Rematch is not null)
                    notifications.Add(DeclineRematch(room, group, "disconnected"));
                if (room.Phase != RacePhase.Running && room.Series is { WinnerId: null })
                {
                    room.Series = null;
                    notifications.Add(group.SendAsync("SeriesCanceled"));
                }
                if (room.Phase is RacePhase.Waiting or RacePhase.Countdown)
                {
                    if (room.Phase == RacePhase.Countdown)
                    {
                        CancelCountdown(room);
                        notifications.Add(group.SendAsync("CountdownCanceled"));
                    }
                    foreach (var player in room.Players.Values)
                        player.Ready = false;
                }
                if (!voluntary)
                    notifications.Add(group.SendAsync("PlayerDisconnected", $"{leavingPlayer.Name} bağlantısı kesildi."));
                if (room.Phase == RacePhase.Running)
                {
                    var winner = room.Players.Single();
                    winner.Value.FinishedAt = now.UtcDateTime;
                    var result = FinishRound(room, winner.Key, now.UtcDateTime,
                        new KeyValuePair<string, PlayerState>(Context.ConnectionId, leavingPlayer));
                    notifications.Add(group.SendAsync("RaceFinished", result));
                }
                else
                {
                    notifications.Add(group.SendAsync("ReadyChanged", BuildReadyPlayers(room)));
                }
                if (voluntary)
                    notifications.Add(Clients.OthersInGroup(room.Code).SendAsync("PlayerLeft", $"{leavingPlayer.Name} oyundan ayrıldı !"));
            }
        }

        if (voluntary)
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, room.Code);
        await Task.WhenAll(notifications);
    }

    private RoomState GetRoom(string? roomCode)
    {
        if (string.IsNullOrWhiteSpace(roomCode) ||
            !_rooms.TryGet(roomCode.Trim(), out var room) ||
            room is null)
        {
            throw new HubException("Oda bulunamadı.");
        }

        lock (room.Lock)
        {
            if (!_rooms.TryGet(room.Code, out var currentRoom) ||
                !ReferenceEquals(room, currentRoom))
            {
                throw new HubException("Oda bulunamadı.");
            }

            room.LastActivityAt = _timeProvider.GetUtcNow();
        }

        return room;
    }

    private static string NormalizePlayerName(string? playerName)
    {
        var normalizedPlayerName = playerName?.Trim();
        if (string.IsNullOrEmpty(normalizedPlayerName))
            throw new HubException("Oyuncu adı gerekli.");

        var characters = normalizedPlayerName.EnumerateRunes().ToArray();
        if (characters.Length is < 3 or > 16 ||
            characters.Any(character =>
                !Rune.IsLetter(character) && character.Value != ' '))
        {
            throw new HubException(
                "Oyuncu adı 3–16 karakter olmalı ve yalnızca harf ile boşluk içerebilir.");
        }

        return normalizedPlayerName;
    }

    private static string NormalizeAvatarId(string? avatarId) =>
        avatarId is "avatar-01" or "avatar-02" or "avatar-03" or "avatar-04"
            or "avatar-05" or "avatar-06" or "avatar-07" or "avatar-08"
            or "avatar-09" or "avatar-10" or "avatar-11" or "avatar-12"
            ? avatarId
            : PlayerState.DefaultAvatarId;

    private static RacePlayerProgress[] BuildProgress(
        RoomState room,
        DateTime? now = null)
    {
        var currentTime = now ?? DateTime.UtcNow;
        return room.Players.Select(entry =>
        {
            var player = entry.Value;
            return new RacePlayerProgress(
                entry.Key,
                player.Name,
                player.AvatarId,
                player.Position,
                player.Errors,
                player.Keystrokes,
                player.Position * 100.0 / room.Text.Length,
                CalculateWpm(player.Position, room.StartedAt, currentTime),
                CalculateAccuracy(player.Keystrokes, player.Errors),
                player.FinishedAt is not null);
        }).ToArray();
    }

    private static RaceResult BuildResult(
        RoomState room,
        string winnerId,
        DateTime now,
        KeyValuePair<string, PlayerState>? additionalPlayer = null)
    {
        var startedAt = room.StartedAt!.Value;
        var entries = room.Players.ToList();
        if (additionalPlayer is { } extraPlayer)
            entries.Add(extraPlayer);

        var players = entries.Select(entry =>
        {
            var player = entry.Value;
            var finishedAt = player.FinishedAt ?? now;
            var elapsedMinutes = Math.Max(
                (finishedAt - startedAt).TotalMinutes,
                1e-6);

            return new RacePlayerResult(
                entry.Key,
                player.Name,
                player.AvatarId,
                player.Position,
                player.Errors,
                player.Keystrokes,
                Math.Round((player.Position / 5.0) / elapsedMinutes),
                CalculateAccuracy(player.Keystrokes, player.Errors),
                player.FinishedAt is not null)
            {
                DurationMs = player.FinishedAt is { } end
                    ? (long)Math.Max(0, (end - startedAt).TotalMilliseconds)
                    : null,
                MissedKeys = new Dictionary<char, int>(player.MissedKeys)
            };
        }).ToArray();

        return new RaceResult(winnerId, players);
    }

    private static double CalculateWpm(
        int position,
        DateTime? startedAt,
        DateTime now)
    {
        if (startedAt is null)
            return 0;

        var elapsedMinutes = Math.Max(
            (now - startedAt.Value).TotalMinutes,
            1e-6);
        return Math.Round((position / 5.0) / elapsedMinutes);
    }

    private static double CalculateAccuracy(int keystrokes, int errors) =>
        keystrokes == 0
            ? 0
            : Math.Round(100.0 * (keystrokes - errors) / keystrokes);

    private static RoomSettings ParseRoomSettings(string? difficulty, int wordCount, string? characterMode)
    {
        try
        {
            return RoomSettings.Create(difficulty, wordCount, characterMode);
        }
        catch (ArgumentException error)
        {
            throw new HubException(error.Message);
        }
    }

    private static object BuildRoomSettings(RoomSettings settings) => new
    {
        difficulty = settings.DifficultyKey,
        wordCount = settings.WordCount,
        characterMode = settings.CharacterModeKey
    };
}
