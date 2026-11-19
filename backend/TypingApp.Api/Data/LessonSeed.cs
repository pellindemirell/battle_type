using Microsoft.EntityFrameworkCore;
using TypingApp.Api.Models;

namespace TypingApp.Api.Data;

public static class LessonSeed
{
    public static async Task SeedAsync(AppDbContext context)
    {
        if (await context.Lessons.AnyAsync())
            return;

        var lessons = new List<Lesson>
        {
            new()
            {
                Order = 1,
                Title = "Ana Sıra: F ve J",
                Category = "Ana Sıra",
                NewKeys = "f j",
                Text = "fff jjj fjf jfj ffj jjf",
                TargetWpm = 15,
                MinAccuracy = 90,
                Difficulty = "Beginner"
            },

            new()
            {
                Order = 2,
                Title = "Ana Sıra: D ve K",
                Category = "Ana Sıra",
                NewKeys = "d k",
                Text = "ddd kkk dkd kdk fdk jkd",
                TargetWpm = 20,
                MinAccuracy = 90,
                Difficulty = "Beginner"
            },

            new()
            {
                Order = 3,
                Title = "Ana Sıra: S ve L",
                Category = "Ana Sıra",
                NewKeys = "s l",
                Text = "sss lll sls lsl dsl ksl",
                TargetWpm = 25,
                MinAccuracy = 90,
                Difficulty = "Beginner"
            },

            new()
            {
                Order = 4,
                Title = "Ana Sıra Tekrar",
                Category = "Tekrar",
                NewKeys = "",
                Text = "asdf jkl asdf jkl fjdksla",
                TargetWpm = 30,
                MinAccuracy = 90,
                Difficulty = "Beginner"
            }
        };

        await context.Lessons.AddRangeAsync(lessons);

        await context.SaveChangesAsync();
    }
}