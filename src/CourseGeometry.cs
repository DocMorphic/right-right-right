using System.Numerics;

namespace RightRightRight;

// Pure geometry: shared by the player and executable seed/clearance tests.
public static class CourseGeometry
{
    public sealed record Result(List<Vector3> Points, int Hairpins, int HardCorners, int Seed);
    public sealed class Rng
    {
        private uint state;
        public Rng(int seed) { state = unchecked((uint)seed); if (state == 0) state = 0x9e3779b9; }
        public uint Next() { state ^= state << 13; state ^= state >> 17; state ^= state << 5; return state; }
        public float Range(float lo, float hi) => lo + (Next() / (float)uint.MaxValue) * (hi - lo);
        public int Int(int lo, int hi) => lo + (int)(Next() % (uint)(hi - lo));
    }

    public static Result Generate(int seed, int profile, int blocks)
    {
        var rng = new Rng(unchecked(seed ^ profile * 16777619));
        var points = new List<Vector3> { new(0, 20, 0) };
        Vector3 position = points[0]; float heading = 0; int hairpins = 0, corners = 0;
        void Add(Vector3 p) { position = p; points.Add(p); }
        void Straight(float length)
        {
            var direction = new Vector3(MathF.Sin(heading), 0, MathF.Cos(heading));
            var start = position; int n = (int)MathF.Ceiling(length / 1.25f);
            for (int i = 1; i <= n; i++) Add(start + direction * (length * i / n));
        }
        void Turn(float degrees, float radius)
        {
            float angle = degrees * MathF.PI / 180, sign = MathF.Sign(angle);
            var right = new Vector3(MathF.Cos(heading), 0, -MathF.Sin(heading));
            var center = position + right * (radius * sign);
            float h0 = heading; int n = (int)MathF.Ceiling(MathF.Abs(angle) * radius / .9f);
            for (int i = 1; i <= n; i++)
            {
                float h = h0 + angle * i / n;
                Add(center - new Vector3(MathF.Cos(h), 0, -MathF.Sin(h)) * (radius * sign));
            }
            heading = h0 + angle;
        }

        Straight(65);
        for (int block = 0; block < blocks; block++)
        {
            int sign = rng.Int(0, 2) == 0 ? -1 : 1;
            int type = block % 3 == 0 ? 0 : rng.Int(0, 3); // At least two pairs of genuine 180-degree turns.
            Straight(rng.Range(28, 55));
            if (type == 0)
            {
                float r = rng.Range(9, 13), span = rng.Range(75, 120), back = rng.Range(40, 62);
                Turn(sign * 90, 12); Straight(span);
                Turn(sign * 180, r); Straight(back);
                Turn(-sign * 180, r); Straight(back + r * 2 + rng.Range(30, 55));
                Turn(-sign * 90, 12); Straight(65);
                hairpins += 2; corners += 2;
            }
            else if (type == 1)
            {
                float span = rng.Range(35, 75), radius = rng.Range(10, 15);
                Turn(sign * 90, radius); Straight(span);
                Turn(-sign * 90, radius); Straight(rng.Range(35, 60));
                Turn(-sign * 90, radius); Straight(span);
                Turn(sign * 90, radius); Straight(35);
                corners += 4;
            }
            else
            {
                float angle = rng.Range(65, 85), span = rng.Range(30, 50);
                Turn(sign * angle, 12); Straight(span);
                Turn(-sign * angle * 2, 10); Straight(span);
                Turn(sign * angle, 12); Straight(50);
                corners += 3;
            }
        }
        Straight(65);
        float distance = 0;
        for (int i = 1; i < points.Count; i++)
        {
            distance += Vector2.Distance(new(points[i - 1].X, points[i - 1].Z), new(points[i].X, points[i].Z));
            var p = points[i];
            p.Y = 20 + Math.Clamp((distance - 65) / 80, 0, 1) * MathF.Sin(distance * .006f) * 3;
            points[i] = p;
        }
        return new Result(points, hairpins, corners, seed);
    }
}
