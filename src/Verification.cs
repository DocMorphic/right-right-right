using System.Text.Json;
using Il2Cpp;
using MelonLoader;
using MelonLoader.Utils;
using UnityEngine;

namespace RightRightRight;

internal static class Verification
{
    internal static void Record(StageDefinition stage, StageController controller, MeshFilter road, List<Vector3> path, float length)
    {
        if (!Environment.GetCommandLineArgs().Contains("--rrr-verify")) return;
        int hits = 0;
        var collider = road.GetComponent<MeshCollider>();
        for (int i = 2; i < path.Count - 2; i += 10)
        {
            var ray = new Ray(path[i] + Vector3.up * 10, Vector3.down);
            if (collider.Raycast(ray, out var hit, 20) && Math.Abs(hit.point.y - path[i].y) < .1f) hits++;
            else throw new InvalidDataException($"Road collision missing at sample {i}.");
        }
        var report = new { stage.Scene, stage.Name, LengthMeters = length, Samples = path.Count, CollisionChecks = hits,
            Start = controller.startPoint.transform.position.ToString(), Finish = controller.finishLine.transform.position.ToString(),
            MeshVertices = road.sharedMesh.vertexCount, Status = "geometry-passed" };
        string folder = Path.Combine(MelonEnvironment.UserDataDirectory, "RightRightRight", "verification");
        Directory.CreateDirectory(folder);
        File.WriteAllText(Path.Combine(folder, stage.Scene + ".json"), JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
        Mod.Log.Msg($"VERIFY_GEOMETRY_PASS {stage.Scene}: {hits} collider probes.");
        MelonCoroutines.Start(AfterPhysics(stage, controller));
    }

    private static System.Collections.IEnumerator AfterPhysics(StageDefinition stage, StageController controller)
    {
        yield return new WaitForSeconds(2);
        var body = controller.car.GetComponent<Rigidbody>();
        controller.enabled = false;
        var bridge = controller.car.GetComponent<NetworkCarBridge>();
        if (bridge != null) bridge.enabled = false;
        controller.car.enabled = true;
        controller.car.SetGridHold(false);
        body.isKinematic = false;
        body.WakeUp();
        var start = body.position;
        body.linearVelocity = controller.car.transform.forward * 5;
        yield return new WaitForSeconds(3);
        bool passed = controller.car.GroundedFraction > 0 && Math.Abs(body.position.y - start.y) < 4;
        Mod.Log.Msg($"VERIFY_PHYSICS_{(passed ? "PASS" : "FAIL")} {stage.Scene}: car={body.position}; travel={Vector3.Distance(start, body.position):F2}; velocity={body.linearVelocity}; grounded={controller.car.GroundedFraction}");
        Application.Quit(passed ? 0 : 3);
    }
}
