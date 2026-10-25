using Il2Cpp;
using UnityEngine;
using Object = UnityEngine.Object;

namespace RightRightRight;

internal sealed class StageHazards
{
    internal static StageHazards? Active;
    internal StageController Controller;
    internal List<Vector3> Path;
    internal List<Collider> Trees;
    internal List<MudDepositTrigger> Deposits = new();
    internal CabinDoor[] Doors = Array.Empty<CabinDoor>();
    internal int DoorRequests;
    private float nextDoor;
    private float committedTurn;
    private CourseGeometry.Rng random;

    internal StageHazards(StageDefinition stage, StageController controller, List<Vector3> path, Transform root, int seed, List<Collider> trees)
    {
        Controller = controller; Path = path; Trees = trees;
        random = new CourseGeometry.Rng(seed ^ 0x564725);
        nextDoor = Time.time + 12;
        var templates = Object.FindObjectsOfType<MudDepositTrigger>(true);
        if (templates.Length == 0) throw new InvalidDataException("Original mud-deposit component is missing.");
        var template = templates[0];
        float distance = 0, next = random.Range(110, 160);
        for (int i = 1; i < path.Count - 35; i++)
        {
            distance += Vector3.Distance(path[i - 1], path[i]);
            if (distance < next) continue;
            var go = Object.Instantiate(template.gameObject, root);
            go.name = $"RRR_Mud_{Deposits.Count + 1}";
            go.transform.SetPositionAndRotation(path[i] + Vector3.up * .02f, Quaternion.LookRotation(StageBuilder.Direction(path, i)));
            go.transform.localScale = Vector3.one;
            var box = go.GetComponent<BoxCollider>();
            if (box == null) box = go.AddComponent<BoxCollider>();
            box.isTrigger = true; box.center = new Vector3(0, .65f, 0); box.size = new Vector3(stage.Width + .5f, 1.5f, 4);
            var deposit = go.GetComponent<MudDepositTrigger>();
            deposit.amount = random.Range(.4f, .65f); deposit.cooldown = 12; deposit._readyTime = 0;
            go.SetActive(true); Deposits.Add(deposit);
            next += random.Range(135, 220);
        }
        Doors = Object.FindObjectsOfType<CabinDoor>(true).ToArray();
        foreach (var door in Doors) door.randomOpen = false; // One host schedules events for both directions.
        if (Doors.Length == 0) throw new InvalidDataException("Original networked cabin door is missing.");
        Active = this;
        Mod.Log.Msg($"HAZARDS_READY seed={seed}; mud={Deposits.Count}; doors={Doors.Length}; solidTreeColliders={Trees.Count}");
    }

    internal void Tick()
    {
        if (Controller == null || Controller.car == null || !Controller.IsRacing || Controller.HasFinished) return;
        if (NetSession.Instance != null && !NetSession.Instance.IsDriver) return;
        if (Math.Abs(Controller.car.SteerInput) > .45f && Controller.car.SpeedKmh > 16) committedTurn += Time.deltaTime;
        else committedTurn = Math.Max(0, committedTurn - Time.deltaTime * 2);
        if (Time.time < nextDoor || committedTurn < .4f) return;
        foreach (var door in Doors) if (!door.IsOpen) { door.RequestOpen(); DoorRequests++; }
        nextDoor = Time.time + random.Range(22, 40); committedTurn = 0;
    }
}
