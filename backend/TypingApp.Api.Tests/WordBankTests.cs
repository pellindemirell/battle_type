using System.Text.Json;
using TypingApp.Api.Services;

namespace TypingApp.Api.Tests;

public sealed class WordBankTests
{
    private static readonly string[] MultiSuffixEndings =
    [
        "lerimiz", "larımız", "leriniz", "larınız",
        "lerimizden", "larımızdan", "lerimizde", "larımızda",
        "lerimizdeki", "larımızdaki", "lerimizin", "larımızın",
        "leriyle", "larıyla", "lerinde", "larında",
        "lerindeki", "larındaki"
    ];

    private static readonly string[] CommonSuffixes =
    [
        "lerimizden", "larımızdan", "lerimizde", "larımızda",
        "lerimizdeki", "larımızdaki", "lerimiz", "larımız",
        "leriniz", "larınız", "lerindeki", "larındaki",
        "ebilir", "abilir", "ilebilir", "ılabilir", "ulabilir",
        "ülebilir", "ebilecek", "abilecek", "ebilecekler",
        "abilecekler", "laştırma", "leştirme", "laştırılmış",
        "leştirilmiş", "landırma", "lendirme", "landırılmış",
        "lendirilmiş", "laştır", "leştir", "landır", "lendir",
        "miş", "mış", "muş", "müş", "acak", "ecek", "ler", "lar",
        "den", "dan", "de", "da", "daki", "taki", "yle", "yla",
        "imiz", "ımız", "umuz", "ümüz", "iniz", "ınız", "unuz",
        "ünüz", "in", "ın", "un", "ün", "nin", "nın", "nun", "nün",
        "lik", "lık", "luk", "lük",
        "laş", "leş", "ma", "me", "dır", "dir", "dur", "dür",
        "tir", "tır", "il", "ıl", "ul", "ül", "i", "ı", "u", "ü"
    ];

    private static readonly IReadOnlyDictionary<string, string[]> Bank =
        LoadBank();

    [Theory]
    [InlineData("easy", 3, 5, 0)]
    [InlineData("medium", 5, 8, 2)]
    [InlineData("hard", 7, 11, 2)]
    [InlineData("expert", 10, 17, 3)]
    public void BankWordsMeetTheirDifficultyRules(
        string difficulty,
        int minLength,
        int maxLength,
        int minSpecialLetters)
    {
        var words = Bank[difficulty];
        Assert.True(words.Length >= 100);
        Assert.Equal(words.Length, words.Distinct(StringComparer.Ordinal).Count());

        foreach (var word in words)
        {
            Assert.InRange(word.Length, minLength, maxLength);
            for (var index = 0; index < word.Length; index++)
            {
                var character = word[index];
                var allowed = character is >= 'a' and <= 'z'
                    || (difficulty != "easy" &&
                        "çğıöşü".Contains(character))
                    || (difficulty == "expert" &&
                        index == 0 &&
                        (character is >= 'A' and <= 'Z' ||
                         "ÇĞİÖŞÜ".Contains(character)));
                Assert.True(allowed, $"Unexpected character in '{word}'.");
            }

            if (difficulty == "easy")
                continue;

            var specialCount = word.Count(character =>
                "çğıöşüÇĞİÖŞÜ".Contains(character));

            if (difficulty == "medium")
                Assert.InRange(specialCount, 0, 2);
            else if (difficulty == "hard")
                Assert.True(specialCount >= minSpecialLetters, word);
            else if (char.IsLower(word[0]))
                Assert.True(
                    specialCount >= minSpecialLetters ||
                    HasMultipleSuffixes(word),
                    $"{word}: {specialCount} special letters, multiple suffixes={HasMultipleSuffixes(word)}");
        }

        if (difficulty == "expert")
            Assert.True(
                words.Count(word => char.IsUpper(word[0])) >=
                Math.Ceiling(words.Length * 0.2));
    }

    [Theory]
    [InlineData(Difficulty.Easy)]
    [InlineData(Difficulty.Medium)]
    [InlineData(Difficulty.Hard)]
    [InlineData(Difficulty.Expert)]
    public void BuildTextClampsWordCountAndAvoidsRepeats(Difficulty difficulty)
    {
        var selector = new WordSelector();

        var minimum = selector.BuildText(difficulty, 5, false, new Random(7));
        var maximum = selector.BuildText(difficulty, 500, false, new Random(7));

        Assert.Equal(30, minimum.Split(' ').Length);
        Assert.Equal(
            30,
            minimum.Split(' ').Distinct(StringComparer.Ordinal).Count());
        Assert.Equal(100, maximum.Split(' ').Length);
        Assert.Equal(
            maximum.Split(' ').Length,
            maximum.Split(' ').Distinct(StringComparer.Ordinal).Count());
        Assert.False(maximum.StartsWith(' '));
        Assert.False(maximum.EndsWith(' '));
    }

    [Theory]
    [InlineData(Difficulty.Easy)]
    [InlineData(Difficulty.Medium)]
    [InlineData(Difficulty.Hard)]
    [InlineData(Difficulty.Expert)]
    public void BuildTextIsSeededAndRespectsSequenceLimits(Difficulty difficulty)
    {
        var selector = new WordSelector();
        var first = selector.BuildText(difficulty, 60, false, new Random(123));
        var sameSeed = selector.BuildText(difficulty, 60, false, new Random(123));
        var otherSeed = selector.BuildText(difficulty, 60, false, new Random(456));

        Assert.Equal(first, sameSeed);
        Assert.NotEqual(first, otherSeed);
        AssertSequenceLimits(first.Split(' '));
    }

    [Fact]
    public void BuildTextRelaxesSequenceLimitsAfterBoundedAttempts()
    {
        var words = Enumerable.Range(0, 100)
            .Select(index => string.Concat(
                'a',
                (char)('a' + index / 26),
                (char)('a' + index % 26)))
            .ToArray();
        var bank = Enum.GetValues<Difficulty>()
            .ToDictionary(difficulty => difficulty, _ => words);
        var text = new WordSelector(bank).BuildText(
            Difficulty.Easy,
            30,
            false,
            new Random(12));
        var selected = text.Split(' ');

        Assert.Equal(30, selected.Length);
        Assert.Equal(30, selected.Distinct(StringComparer.Ordinal).Count());
        Assert.True(selected.Length > 3);
        Assert.Single(selected.Select(word => word[0]).Distinct());
        Assert.Single(selected.Select(word => word.Length).Distinct());
    }

    [Theory]
    [InlineData(Difficulty.Easy)]
    [InlineData(Difficulty.Medium)]
    [InlineData(Difficulty.Hard)]
    [InlineData(Difficulty.Expert)]
    public void SimplifiedTextContainsNoTurkishSpecialLetters(Difficulty difficulty)
    {
        var text = new WordSelector().BuildText(
            difficulty,
            30,
            true,
            new Random(99));
        var words = text.Split(' ');

        Assert.DoesNotContain(
            text,
            character => "çğıöşüÇĞİÖŞÜ".Contains(character));
        Assert.Equal(30, words.Length);
        Assert.Equal(30, words.Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public void SimplificationMapsLowercaseAndUppercaseTurkishLettersOrdinally()
    {
        const string TurkishLetters = "çğıöşüÇĞİÖŞÜ";
        const string ExpectedLetters = "cgiosuCGIOSU";
        var words = Enumerable.Range(0, 30)
            .Select(index => $"{index}{TurkishLetters}")
            .ToArray();
        var bank = Enum.GetValues<Difficulty>()
            .ToDictionary(difficulty => difficulty, _ => words);
        var text = new WordSelector(bank).BuildText(
            Difficulty.Easy,
            30,
            true,
            new Random(20));

        Assert.All(
            text.Split(' '),
            word => Assert.True(
                word.EndsWith(ExpectedLetters, StringComparison.Ordinal),
                word));
    }

    private static IReadOnlyDictionary<string, string[]> LoadBank()
    {
        using var stream = typeof(WordSelector).Assembly.GetManifestResourceStream(
            "TypingApp.Api.Words.tr-words.json");
        Assert.NotNull(stream);
        return JsonSerializer.Deserialize<Dictionary<string, string[]>>(stream!)
            ?? throw new InvalidDataException("The embedded word bank is empty.");
    }

    private static void AssertSequenceLimits(string[] words)
    {
        var sameFirstRun = 1;
        var sameLengthRun = 1;

        for (var index = 1; index < words.Length; index++)
        {
            sameFirstRun = words[index][0] == words[index - 1][0]
                ? sameFirstRun + 1
                : 1;
            sameLengthRun = words[index].Length == words[index - 1].Length
                ? sameLengthRun + 1
                : 1;

            Assert.InRange(sameFirstRun, 1, 3);
            Assert.InRange(sameLengthRun, 1, 3);
        }
    }

    private static bool HasMultipleSuffixes(string word) =>
        MultiSuffixEndings.Any(suffix =>
            word.EndsWith(suffix, StringComparison.Ordinal)) ||
        CanRemoveSuffixes(word, 0);

    private static bool CanRemoveSuffixes(string word, int removed)
    {
        if (removed >= 2)
            return true;

        foreach (var suffix in CommonSuffixes)
        {
            if (word.Length - suffix.Length < 3 ||
                !word.EndsWith(suffix, StringComparison.Ordinal))
            {
                continue;
            }

            if (CanRemoveSuffixes(
                word[..^suffix.Length],
                removed + 1))
            {
                return true;
            }
        }

        return false;
    }
}
