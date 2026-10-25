using Il2Cpp;
using UnityEngine;
using Object = UnityEngine.Object;

namespace RightRightRight;

internal static class TreeBoundary
{
    internal static List<Collider> Build(StageDefinition stage, RoadsideDecorator decorator, List<Vector3> path, Transform root, int seed)
    {
        var colliders = new List<Collider>();
        var trees = decorator.GeneratedRoot.Find("Trees");
        if (trees == null) throw new InvalidDataException("Original roadside tree row is missing.");
        // Keep native tree meshes, materials, scale and trunk-shaped collision. Boundary
        // trees cannot break, so repeated impacts cannot open a shortcut through the forest.
        MakeSolid(trees.gameObject, colliders);
        var random = new CourseGeometry.Rng(seed ^ 0x74726565);
        GameObject AddTree(Vector3 position, string name)
        {
            var templates = decorator.trees.prefabs;
            var template = templates[random.Int(0, templates.Length)];
            var tree = Object.Instantiate(template, root);
            tree.name = name;
            tree.transform.SetPositionAndRotation(position,
                Quaternion.Euler(0, random.Range(0, 360), 0) * template.transform.rotation);
            tree.transform.localScale *= random.Range(decorator.trees.scaleRange.x, decorator.trees.scaleRange.y);
            tree.SetActive(true);
            BreakableTree.EnsureOn(tree);
            MakeSolid(tree, colliders);
            // Some original models have an offset pivot. Place the actual trunk,
            // rather than the model pivot, at the gap we are closing.
            var capsule = colliders[^1].Cast<CapsuleCollider>();
            var center = capsule.transform.TransformPoint(capsule.center);
            tree.transform.position += new Vector3(position.x - center.x, 0, position.z - center.z);
            return tree;
        }
        Physics.SyncTransforms();
        var cells = new Dictionary<(int X, int Z), List<Vector3>>();
        void Remember(Vector3 p)
        {
            var key = ((int)Math.Floor(p.x), (int)Math.Floor(p.z));
            if (!cells.TryGetValue(key, out var list)) cells[key] = list = new List<Vector3>();
            list.Add(p);
        }
        bool Occupied(Vector3 p)
        {
            int x = (int)Math.Floor(p.x), z = (int)Math.Floor(p.z);
            for (int dx = -1; dx <= 1; dx++) for (int dz = -1; dz <= 1; dz++)
                if (cells.TryGetValue((x + dx, z + dz), out var list))
                    foreach (var q in list) if ((p.x-q.x)*(p.x-q.x)+(p.z-q.z)*(p.z-q.z) < .7f*.7f) return true;
            return false;
        }
        foreach (var collider in colliders) Remember(collider.bounds.center);
        float offset = stage.Width * .5f + decorator.trees.edgeOffset;
        int gaps = 0;
        for (int i = 1; i < path.Count; i++) foreach (int sign in new[] { -1, 1 })
        {
            var a = path[i-1] + Vector3.Cross(Vector3.up, StageBuilder.Direction(path, i-1)) * offset * sign;
            var b = path[i] + Vector3.Cross(Vector3.up, StageBuilder.Direction(path, i)) * offset * sign;
            int steps = (int)Math.Ceiling(Vector3.Distance(a, b) / .3f);
            for (int j = 0; j <= steps; j++)
            {
                var p = Vector3.Lerp(a, b, j / (float)steps);
                if (Occupied(p)) continue;
                AddTree(p, $"RRR_GapTree_{gaps++}");
                Remember(p);
            }
        }
        void CloseEnd(int index, float sign)
        {
            var forward = StageBuilder.Direction(path, index);
            var side = Vector3.Cross(Vector3.up, forward);
            float extent = stage.Width * .5f + decorator.trees.edgeOffset;
            int count = (int)Math.Ceiling(extent * 2 / 1.2f);
            for (int i = 0; i <= count; i++)
            {
                AddTree(path[index] + forward * sign * 2 + side * (-extent + 2 * extent * i / count), $"RRR_EndTree_{index}_{i}");
            }
            foreach (int edge in new[] { -1, 1 })
                AddTree(path[index] + forward * sign + side * extent * edge, $"RRR_CornerTree_{index}_{edge}");
        }
        CloseEnd(0, -1);
        CloseEnd(path.Count - 1, 1);
        if (colliders.Count < path.Count / 2) throw new InvalidDataException("Tree boundary collision is incomplete.");
        Mod.Log.Msg($"TREE_BOUNDARY_READY trunks={colliders.Count}; gapTrees={gaps}; native meshes and trunk colliders");
        return colliders;
    }

    private static void MakeSolid(GameObject tree, List<Collider> colliders)
    {
        foreach (var breakable in tree.GetComponentsInChildren<BreakableTree>(true))
        {
            breakable.EnsureCapsule();
            Object.DestroyImmediate(breakable);
        }
        foreach (var collider in tree.GetComponentsInChildren<Collider>(true))
        {
            collider.enabled = true;
            collider.isTrigger = false;
            colliders.Add(collider);
        }
    }
}
