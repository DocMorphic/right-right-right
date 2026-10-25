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
        Physics.SyncTransforms();
        var trunks = StageHazards.Active!.Trees.Select(c => c.Pointer).ToHashSet();
        int treeChecks = 0;
        var treeLayers = StageHazards.Active.Trees.Select(c => c.gameObject).GroupBy(go => go.Pointer)
            .Select(group => (Object: group.First(), Layer: group.First().layer)).ToArray();
        try
        {
            // Isolate the trunk sweep from bushes, the car and mud; restore all layers
            // before normal physics advances. This is verification-only.
            foreach (var tree in treeLayers) tree.Object.layer = 31;
            Physics.SyncTransforms();
            for (int i = 2; i < path.Count - 2; i += 3)
            {
                var side = Vector3.Cross(Vector3.up, StageBuilder.Direction(path, i));
                foreach (int sign in new[] { -1, 1 })
                {
                    var ray = new Ray(path[i] + Vector3.up * .8f, side * sign);
                    if (!Physics.SphereCast(ray, .65f, out var contact, stage.Width * .5f + 3, 1 << 31, QueryTriggerInteraction.Ignore)
                        || !trunks.Contains(contact.collider.Pointer))
                    {
                        var target = path[i] + side * sign * (stage.Width * .5f + 1.8f);
                        foreach (var tree in StageHazards.Active.Trees.OrderBy(c => {
                            var d = c.bounds.center - target; d.y = 0; return d.sqrMagnitude;
                        }).Take(3)) Mod.Log.Msg($"TREE_GAP_DETAIL path={path[i]} side={side * sign} trunk={tree.bounds.center} size={tree.bounds.size} enabled={tree.enabled}");
                        throw new InvalidDataException($"Tree boundary gap at sample {i}, side {sign}.");
                    }
                    treeChecks++;
                }
            }
            foreach (int index in new[] { 0, path.Count - 1 })
            {
                var outward = StageBuilder.Direction(path, index) * (index == 0 ? -1 : 1);
                for (int degrees = -90; degrees <= 90; degrees += 15)
                {
                    var direction = Quaternion.Euler(0, degrees, 0) * outward;
                    if (!Physics.SphereCast(path[index] + Vector3.up * .8f, .65f, direction, out var contact,
                        stage.Width * .5f + 4, 1 << 31, QueryTriggerInteraction.Ignore) || !trunks.Contains(contact.collider.Pointer))
                        throw new InvalidDataException($"Tree boundary gap at route end {index}, angle {degrees}.");
                    treeChecks++;
                }
            }
        }
        finally { foreach (var tree in treeLayers) tree.Object.layer = tree.Layer; Physics.SyncTransforms(); }
        var report = new { stage.Scene, stage.Name, LengthMeters = length, Samples = path.Count, CollisionChecks = hits,
            Seed = CourseSession.CurrentSeed, Hairpins = CourseGeometry.Generate(CourseSession.CurrentSeed, stage.Seed, stage.Blocks).Hairpins,
            HardCorners = CourseGeometry.Generate(CourseSession.CurrentSeed, stage.Seed, stage.Blocks).HardCorners,
            MudDeposits = StageHazards.Active!.Deposits.Count, TreeColliders = StageHazards.Active.Trees.Count, TreeGapChecks = treeChecks,
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
        if (!passed) { Application.Quit(3); yield break; }
        var hazards = StageHazards.Active!;
        controller._phase = StageController.Phase.Racing; controller._runTime = 30;
        var mud = controller.car.GetComponent<WindshieldMud>();
        var puddle = hazards.Deposits[0];
        body.position = puddle.transform.position + Vector3.up * .8f;
        body.rotation = puddle.transform.rotation; body.linearVelocity = puddle.transform.forward * 4;
        Physics.SyncTransforms();
        yield return new WaitForSeconds(1);
        bool splashed = mud.Amount > .1f;
        Mod.Log.Msg($"VERIFY_MUD_SPLASH_{(splashed ? "PASS" : "FAIL")} amount={mud.Amount}");
        mud.RequestClearing(CabinSeat.Passenger, true);
        yield return new WaitForSeconds(mud.clearDuration + 1);
        mud.RequestClearing(CabinSeat.Passenger, false);
        bool wiped = splashed && mud.Amount < .05f;
        Mod.Log.Msg($"VERIFY_MUD_WIPE_{(wiped ? "PASS" : "FAIL")} amount={mud.Amount}");
        var door = hazards.Doors[0];
        int serial = door.OpenSerial;
        door.RequestOpen();
        yield return new WaitForSeconds(1);
        bool opened = door.OpenSerial > serial && door.IsOpen;
        Mod.Log.Msg($"VERIFY_DOOR_{(opened ? "PASS" : "FAIL")} serial={door.OpenSerial} angle={door.Angle}");
        // Actual rigidbody impacts against both escape routes, rather than just checking collider presence.
        controller.car.enabled = false; body.isKinematic = false;
        var forward = StageBuilder.Direction(hazards.Path, 0);
        body.position = hazards.Path[0] + forward * 4 + Vector3.up * .8f;
        body.rotation = Quaternion.LookRotation(forward); body.linearVelocity = -forward * 12; body.angularVelocity = Vector3.zero;
        Physics.SyncTransforms();
        yield return new WaitForSeconds(1.5f);
        bool rear = Vector3.Dot(body.position - hazards.Path[0], forward) > -1.3f;
        Mod.Log.Msg($"VERIFY_REVERSE_TREES_{(rear ? "PASS" : "FAIL")} car={body.position}");
        var right = Vector3.Cross(Vector3.up, forward);
        body.isKinematic = false;
        body.position = hazards.Path[20] + Vector3.up * .8f; body.rotation = Quaternion.LookRotation(forward);
        body.linearVelocity = right * 12; body.angularVelocity = Vector3.zero;
        Physics.SyncTransforms();
        yield return new WaitForSeconds(1.5f);
        bool side = Math.Abs(Vector3.Dot(body.position - hazards.Path[20], right)) < stage.Width * .5f + 2.8f;
        Mod.Log.Msg($"VERIFY_SIDE_TREES_{(side ? "PASS" : "FAIL")} car={body.position}");
        bool all = wiped && opened && rear && side;
        Mod.Log.Msg($"VERIFY_HAZARDS_{(all ? "PASS" : "FAIL")} {stage.Scene}");
        Application.Quit(all ? 0 : 4);
    }
}
