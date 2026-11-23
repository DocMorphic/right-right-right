# Car contact and forest preservation

The original tree-free ragdoll image came from an inspection-only visibility override in `web/ragdoll-qa.html`. That override has been removed. Neither that override nor the inspection HTML was part of the production entry point. The production native scenery metadata and terrain bytes match the original saved export hashes for authored stages 01–03; current checks are in ignored `local/contact-proof/forest-integrity.json` and `live-forest-integrity.json`. No road/forest asset or placement is changed by this correction.

The renderer previously placed every solid car in the cockpit overlay, which clears world depth. Only the occupied cabin now uses that pass; other cars render with ordinary world depth. Loose exterior tablets follow the same rule. Original car meshes and materials remain in use.

`web/client/wheel-contact.js` locates the four original `Quad_Wheel` meshes and fits their lower tread vertices to the rendered road triangles. It preserves the body's existing grade/bank pose and allows each tyre up to 0.3 m of independent visual suspension travel. Exported wheels are siblings of BodyVisual, so cabin lean does not move them off the road. Real airborne states restore native wheel offsets and do not snap back to ground.

`RoadContact` also uses the actual rendered +0.015 m road ribbon on generated courses, rather than sampling only their spline centre height. The native authored road vertices and indices remain untouched.

Small depth-tested, terrain-conforming contact shadows under the tyres and body anchor the car visually where soft cascaded sun shadows lose close contact detail. They fade with distance and disappear during actual jumps. They are car shading, not replacement terrain or new map props. Original directional shadow settings are preserved.

Tests use the original exported wheel geometry on flat, graded, banked and uneven roads and at the three authored spawns. The full suite passes 197 tests; tyre/shadow tests also verify map immutability, airborne behavior, resource disposal and render-layer separation. The local `contact-qa.html` view uses the real authored roads, terrain and forest without hiding scenery. Numerical clearance checks and independent Three raycasts against the visible road mesh agree within millimetres. It is a local inspection fixture, not a production route.

These changes affect presentation only. They do not change steering, grip, braking, multiplayer authority or car collision forces.
