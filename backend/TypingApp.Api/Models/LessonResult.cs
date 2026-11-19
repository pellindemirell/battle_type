namespace TypingApp.Api.Models;

public class LessonResult
{
    public int Id { get; set; }

    public string UserId { get; set; } = "";

    public int LessonId { get; set; }

    public double Wpm { get; set; }

    public double Accuracy { get; set; }

    public int Stars { get; set; }

    public DateTime CompletedAt { get; set; }
}