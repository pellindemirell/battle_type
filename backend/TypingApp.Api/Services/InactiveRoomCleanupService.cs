namespace TypingApp.Api.Services;

public sealed class InactiveRoomCleanupService : BackgroundService
{
    private static readonly TimeSpan InactivityTimeout = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan CleanupInterval = TimeSpan.FromMinutes(1);

    private readonly RaceRoomStore _rooms;
    private readonly TimeProvider _timeProvider;

    public InactiveRoomCleanupService(
        RaceRoomStore rooms,
        TimeProvider timeProvider)
    {
        _rooms = rooms;
        _timeProvider = timeProvider;
    }

    public int CleanupInactiveRooms()
    {
        var expiredAt = _timeProvider.GetUtcNow() - InactivityTimeout;
        var removedCount = 0;

        foreach (var entry in _rooms.Snapshot())
        {
            var room = entry.Value;
            lock (room.Lock)
            {
                if (room.LastActivityAt > expiredAt)
                    continue;

                room.CountdownCancellation?.Cancel();
                if (_rooms.TryRemove(entry.Key))
                    removedCount++;
            }
        }

        return removedCount;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(CleanupInterval, _timeProvider);
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
                CleanupInactiveRooms();
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }
}
