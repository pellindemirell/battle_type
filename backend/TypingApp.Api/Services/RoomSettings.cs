namespace TypingApp.Api.Services;

public enum CharacterMode
{
    Full,
    Simplified
}

public sealed record RoomSettings(
    Difficulty Level,
    int WordCount,
    CharacterMode Mode)
{
    public static RoomSettings Default { get; } =
        new(Difficulty.Easy, 30, CharacterMode.Full);

    public bool SimplifyTurkish =>
        Mode == CharacterMode.Simplified;

    public string DifficultyKey => Level switch
    {
        Difficulty.Easy => "easy",
        Difficulty.Medium => "medium",
        Difficulty.Hard => "hard",
        Difficulty.Expert => "expert",
        _ => throw new InvalidOperationException(
            $"Unsupported difficulty value: {Level}.")
    };

    public string CharacterModeKey => Mode switch
    {
        CharacterMode.Full => "full",
        CharacterMode.Simplified => "simplified",
        _ => throw new InvalidOperationException(
            $"Unsupported character mode value: {Mode}.")
    };

    public static RoomSettings Create(
        string? difficulty,
        int wordCount,
        string? characterMode)
    {
        var parsedDifficulty = difficulty switch
        {
            "easy" => Difficulty.Easy,
            "medium" => Difficulty.Medium,
            "hard" => Difficulty.Hard,
            "expert" => Difficulty.Expert,
            _ => throw new ArgumentException(
                "Geçersiz zorluk seviyesi.",
                nameof(difficulty))
        };

        var parsedCharacterMode = characterMode switch
        {
            "full" => CharacterMode.Full,
            "simplified" => CharacterMode.Simplified,
            _ => throw new ArgumentException(
                "Geçersiz Türkçe karakter modu.",
                nameof(characterMode))
        };

        return new RoomSettings(
            parsedDifficulty,
            Math.Clamp(wordCount, 30, 100),
            parsedCharacterMode);
    }
}
