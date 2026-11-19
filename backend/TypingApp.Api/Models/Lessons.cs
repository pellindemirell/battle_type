namespace TypingApp.Api.Models;

public class Lesson
{
    public int Id { get; set; }

    public int Order { get; set; }

    public string Title { get; set; } = "";

    public string Category { get; set; } = "";

    public string NewKeys { get; set; } = "";

    public string Text { get; set; } = "";

    public int TargetWpm { get; set; }

    public int MinAccuracy { get; set; } = 90;

    public string Content { get; set; } = "";

    public string Difficulty { get; set; } = "Beginner";

    public bool IsActive { get; set; } = true;
}