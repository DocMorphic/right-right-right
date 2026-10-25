using System.Text.Json;
using UnityEngine;

namespace RightRightRight;

public sealed class StageDefinition
{
    public string Scene { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public float Width { get; set; } = 6;
    public int Seed { get; set; }
    public int Blocks { get; set; } = 7;
    public bool Procedural { get; set; } = true;
    public float[][] Points { get; set; } = Array.Empty<float[]>();

    public static StageDefinition[] Read(string file)
    {
        var stages = JsonSerializer.Deserialize<StageDefinition[]>(File.ReadAllText(file))
            ?? throw new InvalidDataException("Stage definitions are empty.");
        foreach (var stage in stages)
        {
            if (!stage.Scene.StartsWith("RRR_") || (!stage.Procedural && stage.Points.Length < 4) || stage.Width < 4 || stage.Width > 8 || stage.Blocks < 4 || stage.Blocks > 12)
                throw new InvalidDataException($"Invalid stage {stage.Scene}.");
            if (stage.Points.Any(p => p.Length != 3 || p.Any(v => !float.IsFinite(v))))
                throw new InvalidDataException($"Invalid points in {stage.Scene}.");
        }
        return stages;
    }

    public List<Vector3> Sample(int? courseSeed = null)
    {
        if (Procedural)
            return CourseGeometry.Generate(courseSeed ?? Seed, Seed, Blocks).Points.Select(p => new Vector3(p.X, p.Y, p.Z)).ToList();
        var result = new List<Vector3>();
        Vector3 Point(int i) { var p = Points[Math.Clamp(i, 0, Points.Length - 1)]; return new(p[0], p[1], p[2]); }
        for (int i = 0; i < Points.Length - 1; i++)
        {
            var a = Point(i - 1); var b = Point(i); var c = Point(i + 1); var d = Point(i + 2);
            int steps = Math.Max(12, (int)(Vector3.Distance(b, c) / 2));
            for (int j = 0; j < steps; j++)
            {
                float t = (float)j / steps;
                result.Add(.5f * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t
                    + (-a + 3 * b - 3 * c + d) * t * t * t));
            }
        }
        result.Add(Point(Points.Length - 1));
        return result;
    }
}
