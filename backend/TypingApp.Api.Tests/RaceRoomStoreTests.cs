using TypingApp.Api.Services;

namespace TypingApp.Api.Tests;

public sealed class RaceRoomStoreTests
{
    [Fact]
    public void TryGet_FindsRoomWithoutCaseSensitiveCodeMatching()
    {
        var store = new RaceRoomStore();
        var room = new RoomState { Code = "ABCD2" };

        Assert.True(store.TryAdd(room));
        Assert.True(store.TryGet("abcd2", out var found));
        Assert.Same(room, found);
    }
}
