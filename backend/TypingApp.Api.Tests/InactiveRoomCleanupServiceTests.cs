using TypingApp.Api.Services;

namespace TypingApp.Api.Tests;

public sealed class InactiveRoomCleanupServiceTests
{
    [Fact]
    public void CleanupInactiveRooms_RemovesRoomsAtTenMinutesAndKeepsRecentActivity()
    {
        var timeProvider = new ManualTimeProvider(
            new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero));
        var store = new RaceRoomStore();
        var inactiveRoom = new RoomState
        {
            Code = "OLD",
            LastActivityAt = timeProvider.GetUtcNow()
        };
        var recentRoom = new RoomState
        {
            Code = "RECENT",
            LastActivityAt = timeProvider.GetUtcNow()
        };
        Assert.True(store.TryAdd(inactiveRoom));
        Assert.True(store.TryAdd(recentRoom));

        var service = new InactiveRoomCleanupService(store, timeProvider);
        timeProvider.Advance(TimeSpan.FromMinutes(9) + TimeSpan.FromSeconds(59));
        recentRoom.LastActivityAt = timeProvider.GetUtcNow();
        Assert.Equal(0, service.CleanupInactiveRooms());

        timeProvider.Advance(TimeSpan.FromSeconds(1));

        Assert.Equal(1, service.CleanupInactiveRooms());
        Assert.False(store.TryGet("OLD", out _));
        Assert.True(store.TryGet("RECENT", out var retained));
        Assert.Same(recentRoom, retained);
    }

    private sealed class ManualTimeProvider(DateTimeOffset now) : TimeProvider
    {
        private DateTimeOffset _now = now;

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan elapsed) => _now += elapsed;
    }
}
