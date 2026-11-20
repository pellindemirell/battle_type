using Microsoft.EntityFrameworkCore;
using TypingApp.Api.Models;

namespace TypingApp.Api.Data;

public static class LessonSeed
{
    public static async Task SeedAsync(AppDbContext context)
    {
        await using var transaction = await context.Database.BeginTransactionAsync();
        var existingOrders = (await context.Lessons.Select(lesson => lesson.Order).ToListAsync()).ToHashSet();

        context.Lessons.AddRange(CreateLessons().Where(lesson => !existingOrders.Contains(lesson.Order)));

        await context.SaveChangesAsync();
        await transaction.CommitAsync();
    }

    private static Lesson[] CreateLessons() =>
    [
        Drill(1, "Ana Sıra: F ve J", "Ana Sıra", "f j", "fff jjj fjf jfj ffj jjf", 15),
        Drill(2, "Ana Sıra: D ve K", "Ana Sıra", "d k", "ddd kkk dkd kdk fdk jkd", 20),
        Drill(3, "Ana Sıra: S ve L", "Ana Sıra", "s l", "sss lll sls lsl dsl ksl", 25),
        Drill(4, "Ana Sıra Tekrar", "Tekrar", "", "asdf jkl asdf jkl fjdksla", 30),
        Drill(5, "Ana Sıra: A ve Ş", "Ana Sıra", "a ş", "aaa şşş aşa şaş aşsa sala", 30),
        Drill(6, "Ana Sıra: G ve H", "Ana Sıra", "g h", "ggg hhh ghg hgh gag hah halka", 30),
        Drill(7, "Ana Sıra: İ", "Ana Sıra", "i", "iii ili iki işi dil şiş iki", 32),
        Drill(8, "Ana Sıra Akıcılığı", "Tekrar", "", "asdfa ghjklşi iki iş şiş dal", 34),
        Drill(9, "Üst Sıra: R ve U", "Üst Sıra", "r u", "rrr uuu rur uru dur gur kur", 34, "Intermediate"),
        Drill(10, "Üst Sıra: E ve I", "Üst Sıra", "e ı", "eee ııı eıe ıeı ara sarı arı", 35, "Intermediate"),
        Drill(11, "Üst Sıra: T ve Y", "Üst Sıra", "t y", "ttt yyy tyt yty yat tut yurt", 36, "Intermediate"),
        Drill(12, "Üst Sıra: O ve P", "Üst Sıra", "o p", "ooo ppp opo pop top orta pota", 37, "Intermediate"),
        Drill(13, "Üst Sıra: Q ve W", "Üst Sıra", "q w", "qqq www qwq wqw qwa wer qwe", 38, "Intermediate"),
        Drill(14, "Üst Sıra: Ğ ve Ü", "Üst Sıra", "ğ ü", "ğğğ üüü ğüğ üğü tür üşü sağ", 38, "Intermediate"),
        Drill(15, "Üst Sıra Tekrar", "Tekrar", "", "uyarı yurt ağır doğru yara pusu qwe wrt", 40, "Intermediate"),
        Drill(16, "Alt Sıra: V ve M", "Alt Sıra", "v m", "vvv mmm vmv mvm tava arma mavi", 40, "Intermediate"),
        Drill(17, "Alt Sıra: B ve N", "Alt Sıra", "b n", "bbb nnn bnb nbn bana naber numara", 41, "Intermediate"),
        Drill(18, "Alt Sıra: C ve Ç", "Alt Sıra", "c ç", "ccc ççç cçc çcç cam çam çabuk", 42, "Intermediate"),
        Drill(19, "Alt Sıra: Ö ve Z", "Alt Sıra", "ö z", "ööö zzz özö zöz göz özel zor", 43, "Intermediate"),
        Drill(20, "Alt Sıra: X", "Alt Sıra", "x", "xxx axa xax xcx xvx tax max", 44, "Intermediate"),
        Drill(21, "Alt Sıra Tekrar", "Tekrar", "", "zxcv bnmöç çözüm canlı çabuk mavi yazın", 45, "Advanced", 93),
        Drill(22, "Türkçe Karakterler", "Türkçe Karakterler", "", "ışık özgür görüş düğün çalış çığ", 48, "Advanced", 94),
        Drill(23, "Kısa Cümleler", "Akıcılık", "", "küçük adımlar güçlü alışkanlıklar oluşturur", 52, "Advanced", 95),
        Drill(24, "Uzun Metin", "Akıcılık", "",
            "doğru ritmi bulduğunda hız artar her tekrar parmaklarını biraz daha güçlendirir", 56, "Advanced", 95)
    ];

    private static Lesson Drill(
        int order, string title, string category, string newKeys, string text,
        int targetWpm, string difficulty = "Beginner", int minAccuracy = 90) =>
        new()
        {
            Order = order,
            Title = title,
            Category = category,
            NewKeys = newKeys,
            Text = text,
            TargetWpm = targetWpm,
            MinAccuracy = minAccuracy,
            Difficulty = difficulty
        };
}
