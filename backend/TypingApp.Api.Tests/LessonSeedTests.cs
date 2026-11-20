using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using TypingApp.Api.Data;
using TypingApp.Api.Models;

namespace TypingApp.Api.Tests;

public class LessonSeedTests
{
    [Fact]
    public async Task SeedAsync_ExpandsAnExistingCatalogWithoutReplacingLessonsOrDuplicatingRows()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;
        await using var context = new AppDbContext(options);
        await context.Database.EnsureCreatedAsync();

        context.Lessons.AddRange(Enumerable.Range(1, 4).Select(order => new Lesson
        {
            Order = order,
            Title = $"Existing lesson {order}",
            Text = "fff jjj",
            IsActive = order != 4
        }));
        await context.SaveChangesAsync();
        var originalId = await context.Lessons.Where(lesson => lesson.Order == 1)
            .Select(lesson => lesson.Id).SingleAsync();

        await LessonSeed.SeedAsync(context);
        await LessonSeed.SeedAsync(context);

        var lessons = await context.Lessons.OrderBy(lesson => lesson.Order).ToListAsync();
        Assert.Equal(Enumerable.Range(1, 24), lessons.Select(lesson => lesson.Order));
        Assert.Equal(originalId, lessons[0].Id);
        Assert.Equal("Existing lesson 1", lessons[0].Title);
        Assert.Equal("fff jjj", lessons[0].Text);
        Assert.False(lessons[3].IsActive);
        Assert.All(lessons.Take(8), lesson => Assert.Equal("Beginner", lesson.Difficulty));
        Assert.All(lessons.Skip(8).Take(12), lesson => Assert.Equal("Intermediate", lesson.Difficulty));
        Assert.All(lessons.Skip(20), lesson => Assert.Equal("Advanced", lesson.Difficulty));
        var keys = lessons.Skip(4).SelectMany(lesson => lesson.NewKeys).ToHashSet();
        Assert.All("qwertyuıopğüghşizxcvbnmöça", key => Assert.Contains(key, keys));
    }
}
