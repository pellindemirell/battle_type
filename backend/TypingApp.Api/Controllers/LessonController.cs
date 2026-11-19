using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TypingApp.Api.Data;

namespace TypingApp.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class LessonsController : ControllerBase
{
    private readonly AppDbContext _context;

    public LessonsController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetLessons()
    {
        var lessons = await _context.Lessons
            .Where(x => x.IsActive)
            .OrderBy(x => x.Order)
            .ToListAsync();

        return Ok(lessons);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetLesson(int id)
    {
        var lesson = await _context.Lessons
            .FirstOrDefaultAsync(x => x.Id == id && x.IsActive);

        if (lesson == null)
            return NotFound("Ders bulunamadı.");

        return Ok(lesson);
    }
}