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
    public async Task OnDisconnectedAsync_FinishesRunningRaceAndAwardsRemainingPlayer()
    {
        var fixture = CreateRunningRoom("ab");
        var remainingPlayer = new PlayerState { Name = "Remaining" };
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
        Assert.Equal(new[] { "player-2", "player-1" }, result.Players.Select(player => player.Id));
        Assert.False(result.Players.Single(player => player.Id == "player-1").Finished);
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

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan elapsed) => _now += elapsed;
    }

    public class RecordingHubCallerClients : DispatchProxy
    {
        private readonly List<SentMessage> _messages = [];

        public IReadOnlyList<SentMessage> Messages => _messages;

        protected override object? Invoke(
            MethodInfo? targetMethod,
            object?[]? args) =>
            new RecordingClientProxy(_messages);
    }

    public sealed record SentMessage(string Method, object?[] Arguments);

    private sealed class RecordingClientProxy(
        List<SentMessage> messages) : IClientProxy
    {
        public Task SendCoreAsync(
            string method,
            object?[] args,
            CancellationToken cancellationToken = default)
        {
            messages.Add(new SentMessage(method, args));
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
