using Il2Cpp;
using Il2CppInterop.Runtime.InteropTypes.Arrays;
using UnityEngine;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

namespace RightRightRight;

internal static class StageBuilder
{
    internal static void Build(StageDefinition stage, StageController controller)
    {
        var path = stage.Sample();
        var originalRoad = GameObject.Find("road_0001").GetComponent<MeshFilter>();
        var material = originalRoad.GetComponent<Renderer>().sharedMaterial;
        var decorator = originalRoad.GetComponent<RoadsideDecorator>();
        var terrain = GameObject.Find("Terrain").GetComponent<Terrain>();
        var terrainLayer = terrain.terrainData.terrainLayers[0];
        var groundMaterial = new Material(Shader.Find("Universal Render Pipeline/Lit"));
        groundMaterial.name = "RRR / original ground texture";
        groundMaterial.mainTexture = terrainLayer.diffuseTexture;
        groundMaterial.color = new Color(.65f, .72f, .58f);

        // Baked roads and props are replaced only inside the six appended scene copies.
        foreach (var renderer in originalRoad.GetComponentsInChildren<Renderer>(true)) renderer.enabled = false;
        foreach (var collider in originalRoad.GetComponentsInChildren<Collider>(true)) collider.enabled = false;
        terrain.gameObject.SetActive(false);
        var mud = GameObject.Find("MudDeposits");
        if (mud != null) mud.SetActive(false);
        var props = GameObject.Find("Roadside_Props");
        if (props != null) props.SetActive(false);

        var root = new GameObject($"Right Right Right / {stage.Name}");
        var road = MeshObject("RRR_Road", Road(path, stage.Width), material, root.transform);
        road.gameObject.layer = originalRoad.gameObject.layer;
        MeshObject("RRR_Ground", Ground(path), groundMaterial, root.transform);
        if (!EasyRoadsCenterline.TryBuild(road, out var nativeSamples) || nativeSamples.Count < 10)
            throw new InvalidDataException("Native navigator rejected the generated road topology.");

        foreach (var tablet in Object.FindObjectsOfType<TabletMinimap>(true))
        {
            tablet.roadMesh = road;
            tablet.roadObjectName = road.gameObject.name;
        }

        // Keep the original gates, triggers, stage controller, vehicle and cabin intact.
        var start = GameObject.Find("StageStart").transform;
        var finish = GameObject.Find("StageFinish").transform;
        PlaceGate(start, path[8], Direction(path, 8));
        PlaceGate(finish, path[^9], Direction(path, path.Count - 9));
        controller.startPoint.transform.SetPositionAndRotation(path[8] + Vector3.up * .75f,
            Quaternion.LookRotation(Direction(path, 8), Vector3.up));
        controller.minFinishSeconds = 25;
        var car = controller.car;
        var body = car.GetComponent<Rigidbody>();
        var pose = controller.startPoint.GetSpawnPose();
        body.position = pose.position;
        body.rotation = pose.rotation;
        body.linearVelocity = Vector3.zero;
        body.angularVelocity = Vector3.zero;
        car.transform.SetPositionAndRotation(pose.position, pose.rotation);
        Physics.SyncTransforms();

        // Reuse the game's native tree/bush/rock generator and its breakable-tree behaviour.
        decorator.enabled = false;
        decorator.roadMesh = road;
        decorator.seed = stage.Seed;
        decorator.rootName = "RRR_Roadside_Props";
        decorator._root = null;
        decorator.trees.snapToTerrain = false;
        decorator.bushes.snapToTerrain = false;
        decorator.rocks.snapToTerrain = false;
        decorator.forestBackfill.snapToTerrain = false;
        decorator.Generate();
        Physics.SyncTransforms();

        float length = 0;
        for (int i = 1; i < path.Count; i++) length += Vector3.Distance(path[i - 1], path[i]);
        Mod.Log.Msg($"STAGE_READY {stage.Scene}: {stage.Name}; {length:F0} m; {nativeSamples.Count} navigator samples; car={pose.position}");
        Verification.Record(stage, controller, road, path, length);
    }

    private static void PlaceGate(Transform gate, Vector3 position, Vector3 direction)
    {
        gate.SetPositionAndRotation(position, Quaternion.LookRotation(direction, Vector3.up));
    }

    internal static Vector3 Direction(List<Vector3> path, int i)
    {
        var d = path[Math.Min(path.Count - 1, i + 1)] - path[Math.Max(0, i - 1)];
        d.y = 0; return d.normalized;
    }

    private static MeshFilter MeshObject(string name, Mesh mesh, Material material, Transform parent)
    {
        var go = new GameObject(name);
        go.transform.SetParent(parent, false);
        var filter = go.AddComponent<MeshFilter>(); filter.sharedMesh = mesh;
        go.AddComponent<MeshRenderer>().sharedMaterial = material;
        go.AddComponent<MeshCollider>().sharedMesh = mesh;
        return filter;
    }

    private static Mesh Road(List<Vector3> path, float width)
    {
        var vertices = new Vector3[path.Count * 2];
        var uv = new Vector2[vertices.Length];
        var triangles = new int[(path.Count - 1) * 6];
        float distance = 0;
        for (int i = 0; i < path.Count; i++)
        {
            if (i > 0) distance += Vector3.Distance(path[i], path[i - 1]);
            var side = Vector3.Cross(Vector3.up, Direction(path, i)) * (width * .5f);
            vertices[2 * i] = path[i] - side;
            vertices[2 * i + 1] = path[i] + side;
            uv[2 * i] = new Vector2(0, distance / width);
            uv[2 * i + 1] = new Vector2(1, distance / width);
            if (i == path.Count - 1) continue;
            int t = i * 6; int v = i * 2;
            triangles[t] = v; triangles[t + 1] = v + 3; triangles[t + 2] = v + 1;
            triangles[t + 3] = v + 2; triangles[t + 4] = v + 3; triangles[t + 5] = v;
        }
        return MakeMesh("RRR / paired road ribbon", vertices, uv, triangles);
    }

    private static Mesh Ground(List<Vector3> path)
    {
        float minX = path.Min(p => p.x) - 100, maxX = path.Max(p => p.x) + 100;
        float minZ = path.Min(p => p.z) - 100, maxZ = path.Max(p => p.z) + 100;
        const float step = 6;
        int nx = (int)Math.Ceiling((maxX - minX) / step) + 1;
        int nz = (int)Math.Ceiling((maxZ - minZ) / step) + 1;
        var vertices = new Vector3[nx * nz]; var uv = new Vector2[vertices.Length];
        var triangles = new int[(nx - 1) * (nz - 1) * 6];
        for (int z = 0; z < nz; z++) for (int x = 0; x < nx; x++)
        {
            float wx = minX + x * step, wz = minZ + z * step;
            float closest = float.MaxValue, height = 20;
            // Project onto segments, so terrain follows the road between sampled vertices.
            for (int j = 1; j < path.Count; j++)
            {
                var a = path[j - 1]; var b = path[j];
                float dx = b.x - a.x, dz = b.z - a.z;
                float t = Math.Clamp(((wx - a.x) * dx + (wz - a.z) * dz) / Math.Max(.001f, dx * dx + dz * dz), 0, 1);
                float px = wx - a.x - t * dx, pz = wz - a.z - t * dz;
                float sq = px * px + pz * pz;
                if (sq < closest) { closest = sq; height = a.y + (b.y - a.y) * t; }
            }
            float distance = MathF.Sqrt(closest);
            float relief = Math.Max(0, distance - 18) * .11f;
            height += relief + MathF.Sin(wx * .025f) * MathF.Cos(wz * .021f) * Math.Clamp((distance - 12) / 20, 0, 1) * 2;
            vertices[z * nx + x] = new Vector3(wx, height - .35f, wz);
            uv[z * nx + x] = new Vector2(wx / 12, wz / 12);
            if (x == nx - 1 || z == nz - 1) continue;
            int v = z * nx + x; int t0 = (z * (nx - 1) + x) * 6;
            triangles[t0] = v; triangles[t0 + 1] = v + nx; triangles[t0 + 2] = v + 1;
            triangles[t0 + 3] = v + 1; triangles[t0 + 4] = v + nx; triangles[t0 + 5] = v + nx + 1;
        }
        return MakeMesh("RRR / ground", vertices, uv, triangles);
    }

    private static Mesh MakeMesh(string name, Vector3[] vertices, Vector2[] uv, int[] triangles)
    {
        var mesh = new Mesh { name = name, indexFormat = IndexFormat.UInt32 };
        mesh.vertices = new Il2CppStructArray<Vector3>(vertices);
        mesh.uv = new Il2CppStructArray<Vector2>(uv);
        mesh.triangles = new Il2CppStructArray<int>(triangles);
        mesh.RecalculateNormals(); mesh.RecalculateBounds();
        return mesh;
    }
}
