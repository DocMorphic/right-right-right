using System.Numerics;
using RightRightRight;

for (int seed = 1; seed <= 128; seed++)
{
    var course = CourseGeometry.Generate(seed, 404 + seed % 6 * 101, 7 + seed % 4);
    if (course.Hairpins < 6 || course.HardCorners < 10) throw new Exception($"Insufficient technical corners for {seed}");
    var repeat = CourseGeometry.Generate(seed, 404 + seed % 6 * 101, 7 + seed % 4);
    if (!course.Points.SequenceEqual(repeat.Points)) throw new Exception("Seed is not repeatable");
    var other = CourseGeometry.Generate(seed + 1, 404 + seed % 6 * 101, 7 + seed % 4);
    if (course.Points.SequenceEqual(other.Points)) throw new Exception("Adjacent seeds produced identical roads");
    var p = course.Points;
    float length = 0; var arc = new float[p.Count];
    for (int i = 1; i < p.Count; i++)
    {
        if (!float.IsFinite(p[i].X + p[i].Y + p[i].Z)) throw new Exception("Non-finite geometry");
        float step = Vector3.Distance(p[i - 1], p[i]);
        if (step < .01f || step > 1.4f) throw new Exception($"Discontinuous road for {seed}: {step}");
        arc[i] = length += step;
    }
    if (length < 1500) throw new Exception("Course is too short");
    // Distant parts must leave room for both road shoulders and their tree trunks.
    for (int i = 0; i < p.Count; i += 4)
        for (int j = i + 4; j < p.Count; j += 4)
            if (arc[j] - arc[i] > 40 && Vector2.Distance(new(p[i].X, p[i].Z), new(p[j].X, p[j].Z)) < 10)
                throw new Exception($"Overlapping driving corridors seed={seed} samples={i},{j}");
}
Console.WriteLine("PASS: 128 course seeds, deterministic replay, different adjacent seeds, >=6 hairpins, >=10 hard corners, continuous samples, and separated driving corridors.");
