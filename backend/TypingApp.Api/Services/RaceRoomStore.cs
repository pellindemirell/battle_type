using System.Collections.Concurrent;

namespace TypingApp.Api.Services;

public sealed class RaceRoomStore
{
    private readonly ConcurrentDictionary<string, RoomState> _rooms =
        new(StringComparer.OrdinalIgnoreCase);

    public IEnumerable<KeyValuePair<string, RoomState>> Snapshot() =>
        _rooms.ToArray();

    public bool TryAdd(RoomState room) =>
        _rooms.TryAdd(room.Code, room);

    public bool TryGet(string code, out RoomState? room) =>
        _rooms.TryGetValue(code, out room);

    public bool TryRemove(string code) =>
        _rooms.TryRemove(code, out _);
}

public sealed class RoomState
{
    public object Lock { get; } = new();

    public string Code { get; init; } = "";

    public string Text { get; init; } = "";

    public RoomSettings Settings { get; init; } = RoomSettings.Default;

    public Dictionary<string, PlayerState> Players { get; } =
        new(StringComparer.Ordinal);

    public DateTimeOffset LastActivityAt { get; set; }

    public DateTime? StartedAt { get; set; }

    public bool Finished { get; set; }

    public RacePhase Phase { get; set; } = RacePhase.Waiting;

    public CancellationTokenSource? CountdownCancellation { get; set; }
}

public enum RacePhase
{
    Waiting,
    Countdown,
    Running,
    Finished
}

public sealed class PlayerState
{
    public const string DefaultAvatarId = "avatar-01";

    public string Name { get; set; } = "";

    public string AvatarId { get; init; } = DefaultAvatarId;

    public int Position { get; set; }

    public int Errors { get; set; }

    public Dictionary<char, int> MissedKeys { get; } = [];

    public int Keystrokes { get; set; }

    public DateTimeOffset? LastKeyAt { get; set; }

    public DateTime? FinishedAt { get; set; }

    public bool Ready { get; set; }
}

public sealed record RacePlayerProgress(
    string Id,
    string Name,
    string AvatarId,
    int Position,
    int Errors,
    int Keystrokes,
    double Progress,
    double Wpm,
    double Accuracy,
    bool Finished);

public sealed record RacePlayerResult(
    string Id,
    string Name,
    string AvatarId,
    int Position,
    int Errors,
    int Keystrokes,
    double Wpm,
    double Accuracy,
    bool Finished)
{
    public IReadOnlyDictionary<char, int> MissedKeys { get; init; } =
        new Dictionary<char, int>();
}

public sealed record RaceResult(
    string WinnerId,
    IReadOnlyList<RacePlayerResult> Players);
