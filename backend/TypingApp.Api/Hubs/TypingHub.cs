using Microsoft.AspNetCore.SignalR;
using TypingApp.Api.Services;

namespace TypingApp.Api.Hubs;

public class TypingHub : Hub
{
    private static readonly TimeSpan MinimumKeyPressInterval =
        TimeSpan.FromMilliseconds(20);

    private readonly RaceRoomStore _rooms;
    private readonly WordSelector _wordSelector;
    private readonly TimeProvider _timeProvider;

    public TypingHub(
        RaceRoomStore rooms,
        WordSelector wordSelector,
        TimeProvider timeProvider)
    {
        _rooms = rooms;
        _wordSelector = wordSelector;
        _timeProvider = timeProvider;
    }

    public async Task<string> CreateRoom(
        string? difficulty,
        int wordCount,
        string? characterMode,
        string? playerName)
    {
        if (string.IsNullOrWhiteSpace(playerName))
            throw new HubException("Oyuncu adı gerekli.");

        RoomSettings settings;
        try
        {
            settings = RoomSettings.Create(
                difficulty,
                wordCount,
                characterMode);
        }
        catch (ArgumentException error)
        {
            throw new HubException(error.Message);
        }

        var normalizedPlayerName = playerName.Trim();
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
                Settings = settings
            };
            room.Players.Add(Context.ConnectionId, new PlayerState
            {
                Name = normalizedPlayerName
            });
        }
        while (!_rooms.TryAdd(room));

        await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);
        await Clients.Caller.SendAsync(
            "RoomCreated",
            new
            {
                roomCode,
                text = room.Text,
                playerName = normalizedPlayerName,
                settings = BuildRoomSettings(room.Settings)
            });

        return roomCode;
    }

    public async Task JoinRoom(string? roomCode, string playerName)
    {
        var room = GetRoom(roomCode);
        if (string.IsNullOrWhiteSpace(playerName))
            throw new HubException("Oyuncu adı gerekli.");

        var connectionId = Context.ConnectionId;
        var normalizedPlayerName = playerName.Trim();
        RacePlayerProgress[] progress;

        lock (room.Lock)
        {
            if (room.Phase != RacePhase.Waiting)
                throw new HubException("Yarışma zaten başladı veya tamamlandı.");

            if (room.Players.ContainsKey(connectionId))
                throw new HubException("Bu oyuncu zaten odada.");

            if (room.Players.Count >= 2)
                throw new HubException("Oda zaten dolu.");

            room.Players.Add(connectionId, new PlayerState
            {
                Name = normalizedPlayerName
            });
            progress = BuildProgress(room);
        }

        await Groups.AddToGroupAsync(connectionId, room.Code);
        await Clients.Group(room.Code).SendAsync(
            "PlayerJoined",
            new
            {
                text = room.Text,
                players = progress,
                settings = BuildRoomSettings(room.Settings)
            });
        await SendReadyStatus(room);
    }

    public async Task SetReady(string? roomCode)
    {
        var room = GetRoom(roomCode);
        CancellationTokenSource? countdown;

        lock (room.Lock)
        {
            if (room.Phase != RacePhase.Waiting)
                throw new HubException("Bu yarışma şu anda hazır duruma alınamaz.");

            if (room.Players.Count != 2)
                throw new HubException("Rakip katılınca hazır olabilirsin.");

            if (!room.Players.TryGetValue(Context.ConnectionId, out var player))
                throw new HubException("Bu yarışmanın oyuncusu değilsin.");

            player.Ready = true;
            countdown = StartCountdownIfEveryoneReady(room);
        }

        await SendReadyStatus(room);
        if (countdown is not null)
            await RunCountdown(room, countdown);
    }

    public async Task Rematch(string? roomCode)
    {
        var room = GetRoom(roomCode);
        CancellationTokenSource? countdown = null;

        lock (room.Lock)
        {
            if (room.Phase != RacePhase.Finished)
                throw new HubException("Rövanş yalnızca yarış bitince istenebilir.");

            if (room.Players.Count != 2)
                throw new HubException("Rövanş için iki oyuncunun da odada olması gerekir.");

            if (!room.Players.TryGetValue(Context.ConnectionId, out var player))
                throw new HubException("Bu yarışmanın oyuncusu değilsin.");

            player.Ready = true;

            if (room.Players.Values.All(candidate => candidate.Ready))
            {
                foreach (var candidate in room.Players.Values)
                {
                    candidate.Position = 0;
                    candidate.Errors = 0;
                    candidate.Keystrokes = 0;
                    candidate.FinishedAt = null;
                }

                room.Finished = false;
                room.StartedAt = null;
                room.Phase = RacePhase.Countdown;
                countdown = room.CountdownCancellation = new CancellationTokenSource();
            }

        }

        await SendReadyStatus(room);
        if (countdown is not null)
            await RunCountdown(room, countdown);
    }

    private async Task RunCountdown(
        RoomState room,
        CancellationTokenSource countdown)
    {
        var token = countdown.Token;

        try
        {
            for (var secondsLeft = 3; secondsLeft > 0; secondsLeft--)
            {
                await Clients.Group(room.Code).SendAsync(
                    "RaceCountdown",
                    secondsLeft,
                    token);
                await Task.Delay(TimeSpan.FromSeconds(1), token);
            }

            DateTime startedAt;
            lock (room.Lock)
            {
                if (room.Phase != RacePhase.Countdown ||
                    room.Players.Count != 2 ||
                    room.Players.Values.Any(player => !player.Ready))
                {
                    return;
                }

                startedAt = DateTime.UtcNow;
                room.StartedAt = startedAt;
                room.Phase = RacePhase.Running;
                room.CountdownCancellation = null;
            }

            await Clients.Group(room.Code).SendAsync(
                "RaceStarted",
                startedAt,
                token);
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
        }
        finally
        {
            lock (room.Lock)
            {
                if (ReferenceEquals(room.CountdownCancellation, countdown))
                    room.CountdownCancellation = null;
            }

            countdown.Dispose();
        }
    }

    private async Task SendReadyStatus(RoomState room)
    {
        object[] players;
        string phase;

        lock (room.Lock)
        {
            players = room.Players.Select(entry => (object)new
            {
                id = entry.Key,
                name = entry.Value.Name,
                ready = entry.Value.Ready
            }).ToArray();
            phase = room.Phase.ToString().ToLowerInvariant();
        }

        await Clients.Group(room.Code).SendAsync(
            "ReadyStatus",
            new { phase, players });
    }

    private static CancellationTokenSource? StartCountdownIfEveryoneReady(
        RoomState room)
    {
        if (room.Players.Count != 2 ||
            room.Players.Values.Any(player => !player.Ready))
        {
            return null;
        }

        room.Phase = RacePhase.Countdown;
        return room.CountdownCancellation = new CancellationTokenSource();
    }

    public async Task KeyPress(string? roomCode, string? key)
    {
        var room = GetRoom(roomCode);
        if (string.IsNullOrEmpty(key) || key.Length != 1)
            return;

        RacePlayerProgress[] progress;
        RaceResult? result = null;
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
                    room.Finished = true;
                    room.Phase = RacePhase.Finished;
                    foreach (var candidate in room.Players.Values)
                        candidate.Ready = false;
                    result = BuildResult(room, Context.ConnectionId, now);
                }
            }
            else
            {
                player.Errors++;
            }

            progress = BuildProgress(room, now);
        }

        await Clients.Group(room.Code).SendAsync("ProgressUpdated", progress);

        if (result is not null)
            await Clients.Group(room.Code).SendAsync("RaceFinished", result);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        foreach (var entry in _rooms.Snapshot())
        {
            var room = entry.Value;
            PlayerState? disconnectedPlayer = null;
            RaceResult? result = null;
            bool removeRoom;
            var resetCountdown = false;

            lock (room.Lock)
            {
                var wasRunning = room.Phase == RacePhase.Running;
                room.Players.Remove(Context.ConnectionId, out disconnectedPlayer);
                removeRoom = disconnectedPlayer is not null && room.Players.Count == 0;

                if (disconnectedPlayer is not null &&
                    room.Phase == RacePhase.Countdown)
                {
                    room.CountdownCancellation?.Cancel();
                    room.CountdownCancellation = null;
                    room.Phase = RacePhase.Waiting;
                    room.StartedAt = null;
                    foreach (var player in room.Players.Values)
                        player.Ready = false;
                    resetCountdown = true;
                }

                if (disconnectedPlayer is not null &&
                    wasRunning &&
                    room.Players.Count == 1)
                {
                    var winner = room.Players.Single();
                    winner.Value.FinishedAt = now;
                    winner.Value.Ready = false;
                    room.Finished = true;
                    room.Phase = RacePhase.Finished;
                    result = BuildResult(
                        room,
                        winner.Key,
                        now,
                        new KeyValuePair<string, PlayerState>(
                            Context.ConnectionId,
                            disconnectedPlayer));
                }
            }

            if (disconnectedPlayer is null)
                continue;

            if (removeRoom)
            {
                room.CountdownCancellation?.Cancel();
                _rooms.TryRemove(entry.Key);
                continue;
            }

            await Clients.Group(room.Code).SendAsync(
                "PlayerDisconnected",
                $"{disconnectedPlayer.Name} bağlantısı kesildi.");

            if (result is not null)
                await Clients.Group(room.Code).SendAsync("RaceFinished", result);

            if (resetCountdown)
                await SendReadyStatus(room);
        }

        await base.OnDisconnectedAsync(exception);
    }

    private RoomState GetRoom(string? roomCode)
    {
        if (string.IsNullOrWhiteSpace(roomCode) ||
            !_rooms.TryGet(roomCode.Trim(), out var room) ||
            room is null)
        {
            throw new HubException("Oda bulunamadı.");
        }

        return room;
    }

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
                player.Position,
                player.Errors,
                player.Keystrokes,
                Math.Round((player.Position / 5.0) / elapsedMinutes),
                CalculateAccuracy(player.Keystrokes, player.Errors),
                player.FinishedAt is not null);
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

    private static object BuildRoomSettings(RoomSettings settings) => new
    {
        difficulty = settings.DifficultyKey,
        wordCount = settings.WordCount,
        characterMode = settings.CharacterModeKey
    };
}
