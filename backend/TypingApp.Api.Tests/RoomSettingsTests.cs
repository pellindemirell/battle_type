using TypingApp.Api.Services;

namespace TypingApp.Api.Tests;

public sealed class RoomSettingsTests
{
    [Theory]
    [InlineData("easy", Difficulty.Easy)]
    [InlineData("medium", Difficulty.Medium)]
    [InlineData("hard", Difficulty.Hard)]
    [InlineData("expert", Difficulty.Expert)]
    public void CreateAcceptsSupportedDifficulties(
        string difficulty,
        Difficulty expected)
    {
        var settings = RoomSettings.Create(difficulty, 45, "full");

        Assert.Equal(expected, settings.Level);
        Assert.Equal(difficulty, settings.DifficultyKey);
        Assert.Equal(45, settings.WordCount);
    }

    [Theory]
    [InlineData("unknown")]
    [InlineData("Easy")]
    [InlineData("")]
    [InlineData(null)]
    public void CreateRejectsUnsupportedDifficulties(string? difficulty)
    {
        Assert.Throws<ArgumentException>(() =>
            RoomSettings.Create(difficulty, 30, "full"));
    }

    [Theory]
    [InlineData("full", CharacterMode.Full, false)]
    [InlineData("simplified", CharacterMode.Simplified, true)]
    public void CreateMapsCharacterModes(
        string characterMode,
        CharacterMode expected,
        bool simplifyTurkish)
    {
        var settings = RoomSettings.Create("easy", 30, characterMode);

        Assert.Equal(expected, settings.Mode);
        Assert.Equal(characterMode, settings.CharacterModeKey);
        Assert.Equal(simplifyTurkish, settings.SimplifyTurkish);
    }

    [Theory]
    [InlineData("partial")]
    [InlineData("")]
    [InlineData(null)]
    public void CreateRejectsUnsupportedCharacterModes(string? characterMode)
    {
        Assert.Throws<ArgumentException>(() =>
            RoomSettings.Create("easy", 30, characterMode));
    }

    [Theory]
    [InlineData(5, 30)]
    [InlineData(45, 45)]
    [InlineData(500, 100)]
    public void CreateClampsWordCount(int requested, int expected)
    {
        var settings = RoomSettings.Create("easy", requested, "full");

        Assert.Equal(expected, settings.WordCount);
    }
}
