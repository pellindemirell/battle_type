using System.Reflection;
using System.Text;
using System.Text.Json;

namespace TypingApp.Api.Services;

public enum Difficulty
{
    Easy,
    Medium,
    Hard,
    Expert
}

public sealed class WordSelector
{
    private const string ResourceName = "TypingApp.Api.Words.tr-words.json";
    private const int SequenceAttempts = 50;
    private readonly IReadOnlyDictionary<Difficulty, string[]> _words;

    public WordSelector()
    {
        _words = LoadWordBank();
    }

    public WordSelector(
        IReadOnlyDictionary<Difficulty, string[]> wordBank)
    {
        ArgumentNullException.ThrowIfNull(wordBank);

        _words = Enum.GetValues<Difficulty>().ToDictionary(
            difficulty => difficulty,
            difficulty => wordBank.TryGetValue(difficulty, out var words) &&
                          words is not null
                ? words
                : throw new InvalidDataException(
                    $"The word bank has no '{difficulty}' words."));
    }

    private static IReadOnlyDictionary<Difficulty, string[]> LoadWordBank()
    {
        using var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException(
                $"Embedded word bank resource '{ResourceName}' was not found.");

        var source = JsonSerializer.Deserialize<Dictionary<string, string[]>>(
            stream)
            ?? throw new InvalidDataException("The embedded word bank is empty.");

        return new Dictionary<Difficulty, string[]>
        {
            [Difficulty.Easy] = GetWords(source, "easy"),
            [Difficulty.Medium] = GetWords(source, "medium"),
            [Difficulty.Hard] = GetWords(source, "hard"),
            [Difficulty.Expert] = GetWords(source, "expert")
        };
    }

    public string BuildText(
        Difficulty difficulty,
        int wordCount,
        bool simplifyTurkish,
        Random? rng = null)
    {
        if (!_words.TryGetValue(difficulty, out var source))
            throw new ArgumentOutOfRangeException(nameof(difficulty));

        var random = rng ?? Random.Shared;
        var count = Math.Clamp(wordCount, 30, 100);
        var words = source
            .Select(word => simplifyTurkish ? SimplifyTurkish(word) : word)
            .Distinct(StringComparer.Ordinal)
            .ToList();

        if (words.Count < count)
        {
            throw new InvalidOperationException(
                $"Difficulty '{difficulty}' has only {words.Count} unique words; {count} are required.");
        }

        for (var attempt = 0; attempt < SequenceAttempts; attempt++)
        {
            var selection = TryBuildSequence(words, count, random);
            if (selection is not null)
                return string.Join(' ', selection);
        }

        Shuffle(words, random);
        return string.Join(' ', words.Take(count));
    }

    private static string[]? TryBuildSequence(
        IReadOnlyList<string> source,
        int count,
        Random random)
    {
        var words = source.ToList();
        Shuffle(words, random);

        var selected = new List<string>(count);
        var previousFirst = '\0';
        var previousLength = 0;
        var sameFirstRun = 0;
        var sameLengthRun = 0;

        for (var selectedCount = 0; selectedCount < count; selectedCount++)
        {
            var eligible = new List<int>();
            for (var index = 0; index < words.Count; index++)
            {
                var candidate = words[index];
                var firstRun = candidate[0] == previousFirst
                    ? sameFirstRun + 1
                    : 1;
                var lengthRun = candidate.Length == previousLength
                    ? sameLengthRun + 1
                    : 1;

                if (firstRun <= 3 && lengthRun <= 3)
                {
                    eligible.Add(index);
                }
            }

            if (eligible.Count == 0)
                return null;

            var selectedIndex = eligible[random.Next(eligible.Count)];
            var word = words[selectedIndex];
            words.RemoveAt(selectedIndex);
            selected.Add(word);

            sameFirstRun = word[0] == previousFirst ? sameFirstRun + 1 : 1;
            sameLengthRun = word.Length == previousLength ? sameLengthRun + 1 : 1;
            previousFirst = word[0];
            previousLength = word.Length;
        }

        return selected.ToArray();
    }

    private static string[] GetWords(
        IReadOnlyDictionary<string, string[]> source,
        string difficulty)
    {
        if (!source.TryGetValue(difficulty, out var words) ||
            words.Length == 0 ||
            words.Any(string.IsNullOrWhiteSpace))
        {
            throw new InvalidDataException(
                $"The embedded word bank has no valid '{difficulty}' words.");
        }

        return words;
    }

    private static void Shuffle<T>(IList<T> items, Random random)
    {
        for (var index = items.Count - 1; index > 0; index--)
        {
            var swapIndex = random.Next(index + 1);
            (items[index], items[swapIndex]) = (items[swapIndex], items[index]);
        }
    }

    private static string SimplifyTurkish(string word)
    {
        var simplified = new StringBuilder(word.Length);
        foreach (var character in word)
        {
            simplified.Append(character switch
            {
                'ç' => 'c',
                'ğ' => 'g',
                'ı' => 'i',
                'ö' => 'o',
                'ş' => 's',
                'ü' => 'u',
                'Ç' => 'C',
                'Ğ' => 'G',
                'İ' => 'I',
                'Ö' => 'O',
                'Ş' => 'S',
                'Ü' => 'U',
                _ => character
            });
        }

        return simplified.ToString();
    }
}
