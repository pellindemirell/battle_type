using System.Collections.Concurrent;
using System.Reflection;
using System.Security.Claims;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;
using TypingApp.Api.Hubs;
using TypingApp.Api.Services;

namespace TypingApp.Api.Tests;

public sealed class TypingHubTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("ab")]
    public async Task KeyPress_IgnoresInvalidKeys(string? key)
    {
        var fixture = CreateRunningRoom("ab");

        await fixture.Hub.KeyPress(fixture.Room.Code, key);

        Assert.Equal(0, fixture.Player.Position);
        Assert.Equal(0, fixture.Player.Keystrokes);
        Assert.Equal(0, fixture.Player.Errors);
    }

    [Theory]
    [InlineData("Player1")]
    [InlineData("Player!")]
    [InlineData("ab")]
    [InlineData("abcdefghijklmnopq")]
    public async Task CreateRoom_RejectsInvalidPlayerNames(string playerName)
    {
        var fixture = CreateRunningRoom("a");

        var error = await Assert.ThrowsAsync<HubException>(() =>
            fixture.Hub.CreateRoom("easy", 30, "full", playerName));

        Assert.Contains("3–16", error.Message);
        Assert.Empty(fixture.Clients.Messages);
    }

    [Theory]
    [InlineData("Player1")]
    [InlineData("Player!")]
    [InlineData("ab")]
    [InlineData("abcdefghijklmnopq")]
    public async Task JoinRoom_RejectsInvalidPlayerNames(string playerName)
    {
        var fixture = CreateRunningRoom("a");

        var error = await Assert.ThrowsAsync<HubException>(() =>
            fixture.Hub.JoinRoom(fixture.Room.Code, playerName));

        Assert.Contains("3–16", error.Message);
        Assert.Single(fixture.Room.Players);
    }

    [Fact]
    public async Task JoinRoom_AcceptsTurkishLettersAndSpacesInPlayerName()
    {
        var fixture = CreateRunningRoom("a");
        fixture.Room.Phase = RacePhase.Waiting;
        var joiningHub = CreateHubForPlayer(fixture, "player-2");

        await joiningHub.JoinRoom(fixture.Room.Code, " Çağrı Test ");

        Assert.Equal("Çağrı Test", fixture.Room.Players["player-2"].Name);
    }

    [Theory]
    [InlineData("avatar-12", "avatar-12")]
    [InlineData("avatar-13", "avatar-01")]
    [InlineData(null, "avatar-01")]
    public async Task CreateRoomWithProfile_StoresAndReportsTheValidatedAvatar(
        string? requestedAvatar, string expectedAvatar)
    {
        var fixture = CreateRunningRoom("a");
        var code = await fixture.Hub.CreateRoomWithProfile(
            "easy", 30, "full", " abcdefghijklmnop ", requestedAvatar);

        Assert.True(fixture.Store.TryGet(code, out var room));
        Assert.NotNull(room);
        var creator = room.Players["player-1"];
        Assert.Equal("abcdefghijklmnop", creator.Name);
        Assert.Equal(expectedAvatar, creator.AvatarId);
        var message = Assert.Single(fixture.Clients.Messages, item => item.Method == "RoomCreated");
        Assert.Equal(expectedAvatar, ReadProperty<string>(message.Arguments[0], "avatarId"));
        Assert.Null(message.Arguments[0]!.GetType().GetProperty("text"));
    }

    [Theory]
    [InlineData("avatar-01", "avatar-01")]
    [InlineData("invalid", "avatar-01")]
    [InlineData("avatar-08", "avatar-08")]
    public async Task JoinRoomWithProfile_StoresAndReportsSharedOrDistinctAvatars(
        string requestedAvatar, string expectedAvatar)
    {
        var fixture = CreateRunningRoom("a");
        fixture.Room.Phase = RacePhase.Waiting;
        var joiningHub = CreateHubForPlayer(fixture, "player-2");
        joiningHub.Clients = fixture.Hub.Clients;

        await joiningHub.JoinRoomWithProfile(fixture.Room.Code, "Other", requestedAvatar);

        Assert.Equal("avatar-01", fixture.Room.Players["player-1"].AvatarId);
        Assert.Equal(expectedAvatar, fixture.Room.Players["player-2"].AvatarId);
        var message = Assert.Single(fixture.Clients.Messages, item => item.Method == "PlayerJoined");
        Assert.Null(message.Arguments[0]!.GetType().GetProperty("text"));
        var players = ReadProperty<RacePlayerProgress[]>(message.Arguments[0], "players");
        Assert.Equal(2, players.Length);
        Assert.Equal("avatar-01", players.Single(player => player.Id == "player-1").AvatarId);
        Assert.Equal(expectedAvatar, players.Single(player => player.Id == "player-2").AvatarId);
    }

    [Fact]
    public async Task Ready_SendsTextOnlyAfterBothPlayersAndThreeSeconds()
    {
        var fixture = CreateWaitingRoom();
        var opponent = CreateHubForPlayer(fixture, "player-2");
        opponent.Clients = fixture.Hub.Clients;

        await fixture.Hub.Ready(fixture.Room.Code, true);
        Assert.Equal(RacePhase.Waiting, fixture.Room.Phase);
        Assert.DoesNotContain(fixture.Clients.Messages, item => item.Method == "CountdownStarted");

        await opponent.Ready(fixture.Room.Code, true);
        Assert.Equal(RacePhase.Countdown, fixture.Room.Phase);
        var countdown = Assert.Single(fixture.Clients.Messages, item => item.Method == "CountdownStarted");
        Assert.Equal(3, countdown.Arguments[0]);
        fixture.TimeProvider.Advance(TimeSpan.FromMilliseconds(2999));
        await fixture.Hub.KeyPress(fixture.Room.Code, "a");
        Assert.Equal(0, fixture.Player.Keystrokes);
        Assert.Null(fixture.Room.StartedAt);

        fixture.TimeProvider.Advance(TimeSpan.FromMilliseconds(1));
        var started = await WaitForMessage(fixture, "RaceStarted");
        Assert.Equal(RacePhase.Running, fixture.Room.Phase);
        Assert.Equal(fixture.TimeProvider.GetUtcNow().UtcDateTime, fixture.Room.StartedAt);
        Assert.Equal("a", ReadProperty<string>(started.Arguments[0], "text"));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Countdown_IsCanceledByUnreadyOrDisconnect(bool disconnect)
    {
        var fixture = CreateWaitingRoom();
        var opponent = CreateHubForPlayer(fixture, "player-2");
        opponent.Clients = fixture.Hub.Clients;
        await fixture.Hub.Ready(fixture.Room.Code, true);
        await opponent.Ready(fixture.Room.Code, true);

        if (disconnect)
            await opponent.OnDisconnectedAsync(null);
        else
            await opponent.Ready(fixture.Room.Code, false);

        fixture.TimeProvider.Advance(TimeSpan.FromSeconds(4));
        Assert.Equal(RacePhase.Waiting, fixture.Room.Phase);
        Assert.Null(fixture.Room.StartedAt);
        Assert.Contains(fixture.Clients.Messages, item => item.Method == "CountdownCanceled");
        Assert.DoesNotContain(fixture.Clients.Messages, item => item.Method == "RaceStarted");
    }

    private static HubFixture CreateWaitingRoom()
    {
        var fixture = CreateRunningRoom("a");
        fixture.Room.Phase = RacePhase.Waiting;
        fixture.Room.StartedAt = null;
        fixture.Room.Players.Add("player-2", new PlayerState { Name = "Other" });
        return fixture;
    }

    private static async Task<SentMessage> WaitForMessage(HubFixture fixture, string method)
    {
        for (var attempt = 0; attempt < 100; attempt++)
        {
            var message = fixture.Clients.Messages.FirstOrDefault(item => item.Method == method);
            if (message is not null)
                return message;
            await Task.Delay(10);
        }

        throw new TimeoutException($"Expected {method}.");
    }

    [Fact]
    public async Task Chat_ValidatesMembershipLengthPhaseAndPerConnectionRate()
    {
        var fixture = CreateWaitingRoom();
        var intruder = CreateHubForPlayer(fixture, "outsider");
        await Assert.ThrowsAsync<HubException>(() => intruder.SendMessage(fixture.Room.Code, "Merhaba"));
        await Assert.ThrowsAsync<HubException>(() => fixture.Hub.SendMessage(fixture.Room.Code, "   "));
        await Assert.ThrowsAsync<HubException>(() => fixture.Hub.SendMessage(fixture.Room.Code, new string('a', 141)));

        var sent = await fixture.Hub.SendMessage(fixture.Room.Code, " <b>Merhaba</b> ");
        Assert.Equal("<b>Merhaba</b>", sent.Text);
        Assert.Equal("Player", sent.FromName);
        var notification = Assert.Single(fixture.Clients.Messages, message => message.Method == "MessageReceived");
        Assert.Equal(sent, notification.Arguments[0]);

        await Assert.ThrowsAsync<HubException>(() => fixture.Hub.SendMessage(fixture.Room.Code, "Yine"));
        fixture.TimeProvider.Advance(TimeSpan.FromSeconds(1));
        await fixture.Hub.SendMessage(fixture.Room.Code, new string('a', 140));
        fixture.TimeProvider.Advance(TimeSpan.FromSeconds(1));
        fixture.Room.Phase = RacePhase.Running;
        await Assert.ThrowsAsync<HubException>(() => fixture.Hub.SendMessage(fixture.Room.Code, "Yarış"));
    }

    private static T ReadProperty<T>(object? payload, string name)
    {
        Assert.NotNull(payload);
        return Assert.IsType<T>(payload.GetType().GetProperty(name)?.GetValue(payload));
    }

    [Fact]
    public async Task KeyPress_RefreshesRoomActivity()
    {
        var fixture = CreateRunningRoom("ab");
        fixture.TimeProvider.Advance(TimeSpan.FromMinutes(1));

        await fixture.Hub.KeyPress(fixture.Room.Code, null);

        Assert.Equal(fixture.TimeProvider.GetUtcNow(), fixture.Room.LastActivityAt);
    }

    [Fact]
    public async Task KeyPress_IgnoresInputsWithinTwentyMilliseconds()
    {
        var fixture = CreateRunningRoom("ab");

        await fixture.Hub.KeyPress(fixture.Room.Code, "a");
        fixture.TimeProvider.Advance(TimeSpan.FromMilliseconds(19));
        await fixture.Hub.KeyPress(fixture.Room.Code, "b");

        Assert.Equal(1, fixture.Player.Position);
        Assert.Equal(1, fixture.Player.Keystrokes);

        fixture.TimeProvider.Advance(TimeSpan.FromMilliseconds(1));
        await fixture.Hub.KeyPress(fixture.Room.Code, "b");

        Assert.Equal(2, fixture.Player.Position);
        Assert.Equal(2, fixture.Player.Keystrokes);
        Assert.Equal(RacePhase.Finished, fixture.Room.Phase);
    }

    [Fact]
    public async Task KeyPress_KeepsOrdinalCharacterComparison()
    {
        var fixture = CreateRunningRoom("A");

        await fixture.Hub.KeyPress(fixture.Room.Code, "a");

        Assert.Equal(0, fixture.Player.Position);
        Assert.Equal(1, fixture.Player.Errors);

        fixture.TimeProvider.Advance(TimeSpan.FromMilliseconds(20));
        await fixture.Hub.KeyPress(fixture.Room.Code, "A");

        Assert.Equal(1, fixture.Player.Position);
        Assert.Equal(RacePhase.Finished, fixture.Room.Phase);
    }

    [Fact]
    public async Task KeyPress_CountsMissedExpectedCharactersInResult()
    {
        var fixture = CreateRunningRoom("a");

        await fixture.Hub.KeyPress(fixture.Room.Code, "x");
        fixture.TimeProvider.Advance(TimeSpan.FromMilliseconds(20));
        await fixture.Hub.KeyPress(fixture.Room.Code, "a");

        Assert.Equal(1, fixture.Player.MissedKeys['a']);
        Assert.False(fixture.Player.MissedKeys.ContainsKey('x'));

        var finishedEvent = Assert.Single(
            fixture.Clients.Messages,
            message => message.Method == "RaceFinished");
        var result = Assert.IsType<RaceResult>(finishedEvent.Arguments[0]);
        var playerResult = Assert.Single(result.Players);
        Assert.Equal(20L, playerResult.DurationMs);
        Assert.Equal(1, playerResult.MissedKeys['a']);
        Assert.False(playerResult.MissedKeys.ContainsKey('x'));
    }

    [Fact]
    public async Task OnDisconnectedAsync_FinishesRunningRaceAndAwardsRemainingPlayer()
    {
        var fixture = CreateRunningRoom("ab");
        var remainingPlayer = new PlayerState { Name = "Remaining", AvatarId = "avatar-06" };
        fixture.Room.Players.Add("player-2", remainingPlayer);

        await fixture.Hub.OnDisconnectedAsync(null);

        Assert.Equal(RacePhase.Finished, fixture.Room.Phase);
        Assert.True(fixture.Room.Finished);
        Assert.False(remainingPlayer.Ready);
        Assert.Equal(fixture.TimeProvider.GetUtcNow().UtcDateTime, remainingPlayer.FinishedAt);
        Assert.DoesNotContain("player-1", fixture.Room.Players.Keys);

        var disconnectedEvent = Assert.Single(
            fixture.Clients.Messages,
            message => message.Method == "PlayerDisconnected");
        Assert.Equal("Player bağlantısı kesildi.", disconnectedEvent.Arguments[0]);

        var finishedEvent = Assert.Single(
            fixture.Clients.Messages,
            message => message.Method == "RaceFinished");
        var result = Assert.IsType<RaceResult>(finishedEvent.Arguments[0]);
        Assert.Equal("player-2", result.WinnerId);
        Assert.Equal("avatar-06", result.Players.Single(player => player.Id == result.WinnerId).AvatarId);
        Assert.Equal(new[] { "player-2", "player-1" }, result.Players.Select(player => player.Id));
        Assert.False(result.Players.Single(player => player.Id == "player-1").Finished);
        Assert.Null(result.Players.Single(player => player.Id == "player-1").DurationMs);
        Assert.True(result.Players.Single(player => player.Id == "player-2").Finished);

        var remainingHub = CreateHubForPlayer(fixture, "player-2");
        await remainingHub.KeyPress(fixture.Room.Code, "a");
        Assert.Equal(0, remainingPlayer.Position);
        Assert.Equal(0, remainingPlayer.Keystrokes);
    }

    private static HubFixture CreateRunningRoom(string text)
    {
        var timeProvider = new ManualTimeProvider(
            new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero));
        var player = new PlayerState { Name = "Player" };
        var room = new RoomState
        {
            Code = "ROOM1",
            Text = text,
            StartedAt = timeProvider.GetUtcNow().UtcDateTime,
            LastActivityAt = timeProvider.GetUtcNow(),
            Phase = RacePhase.Running
        };
        room.Players.Add("player-1", player);

        var store = new RaceRoomStore();
        Assert.True(store.TryAdd(room));

        var clients = DispatchProxy.Create<IHubCallerClients, RecordingHubCallerClients>();
        var recordingClients = (RecordingHubCallerClients)(object)clients;
        var hub = new TypingHub(store, new WordSelector(), timeProvider)
        {
            Context = new TestHubCallerContext("player-1"),
            Clients = clients,
            Groups = new TestGroupManager()
        };

        return new HubFixture(
            hub,
            room,
            player,
            timeProvider,
            store,
            recordingClients);
    }

    private static TypingHub CreateHubForPlayer(
        HubFixture fixture,
        string connectionId) =>
        new(fixture.Store, new WordSelector(), fixture.TimeProvider)
        {
            Context = new TestHubCallerContext(connectionId),
            Clients = DispatchProxy.Create<IHubCallerClients, RecordingHubCallerClients>(),
            Groups = new TestGroupManager()
        };

    private sealed record HubFixture(
        TypingHub Hub,
        RoomState Room,
        PlayerState Player,
        ManualTimeProvider TimeProvider,
        RaceRoomStore Store,
        RecordingHubCallerClients Clients);

    private sealed class ManualTimeProvider(DateTimeOffset now) : TimeProvider
    {
        private DateTimeOffset _now = now;
        private readonly List<ManualTimer> _timers = [];

        public override DateTimeOffset GetUtcNow()
        {
            lock (_timers)
                return _now;
        }

        public override ITimer CreateTimer(
            TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
        {
            var timer = new ManualTimer(this, callback, state);
            timer.Change(dueTime, period);
            return timer;
        }

        public void Advance(TimeSpan elapsed)
        {
            ManualTimer[] expired;
            lock (_timers)
            {
                _now += elapsed;
                expired = _timers.Where(timer => timer.DueAt <= _now).ToArray();
                foreach (var timer in expired)
                    _timers.Remove(timer);
            }
            foreach (var timer in expired)
                timer.Fire();
        }

        private sealed class ManualTimer(ManualTimeProvider clock, TimerCallback callback, object? state)
            : ITimer
        {
            private bool _disposed;
            public DateTimeOffset DueAt { get; private set; }

            public bool Change(TimeSpan dueTime, TimeSpan period)
            {
                Assert.Equal(Timeout.InfiniteTimeSpan, period);
                lock (clock._timers)
                {
                    if (_disposed)
                        return false;

                    clock._timers.Remove(this);
                    if (dueTime != Timeout.InfiniteTimeSpan)
                    {
                        DueAt = clock._now + dueTime;
                        clock._timers.Add(this);
                    }
                    return true;
                }
            }

            public void Fire() => callback(state);

            public void Dispose()
            {
                lock (clock._timers)
                {
                    _disposed = true;
                    clock._timers.Remove(this);
                }
            }

            public ValueTask DisposeAsync()
            {
                Dispose();
                return ValueTask.CompletedTask;
            }
        }
    }

    public class RecordingHubCallerClients : DispatchProxy
    {
        private readonly ConcurrentQueue<SentMessage> _messages = new();

        public IReadOnlyList<SentMessage> Messages => _messages.ToArray();

        protected override object? Invoke(
            MethodInfo? targetMethod,
            object?[]? args) =>
            new RecordingClientProxy(_messages);
    }

    public sealed record SentMessage(string Method, object?[] Arguments);

    private sealed class RecordingClientProxy(
        ConcurrentQueue<SentMessage> messages) : ISingleClientProxy
    {
        public Task<T> InvokeCoreAsync<T>(
            string method,
            object?[] args,
            CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task SendCoreAsync(
            string method,
            object?[] args,
            CancellationToken cancellationToken = default)
        {
            messages.Enqueue(new SentMessage(method, args));
            return Task.CompletedTask;
        }
    }

    private sealed class TestGroupManager : IGroupManager
    {
        public Task AddToGroupAsync(
            string connectionId,
            string groupName,
            CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task RemoveFromGroupAsync(
            string connectionId,
            string groupName,
            CancellationToken cancellationToken = default) =>
            Task.CompletedTask;
    }

    private sealed class TestHubCallerContext(string connectionId)
        : HubCallerContext
    {
        private readonly IDictionary<object, object?> _items = new Dictionary<object, object?>();

        public override string ConnectionId => connectionId;

        public override string? UserIdentifier => null;

        public override ClaimsPrincipal? User => null;

        public override IDictionary<object, object?> Items => _items;

        public override IFeatureCollection Features { get; } = new FeatureCollection();

        public override CancellationToken ConnectionAborted => CancellationToken.None;

        public override void Abort()
        {
        }
    }
}
