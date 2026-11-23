/** Browser protocol is deliberately separate from the Unity/DTLS release protocol. */
export const PROTOCOL_VERSION = 1;
export const PHYSICS_HZ = 50;
export const SNAPSHOT_HZ = 20;
export const START_COUNTDOWN_SECONDS = 3;
export const MAX_MESSAGE_BYTES = 8192;
export const MODES = Object.freeze({coop: {players: 2, cars: 1}, race: {players: 4, cars: 2}});
export const BUTTONS = Object.freeze({HAND_BRAKE: 1, GRAB: 2, DOOR: 4, WIPE: 8});
export function validMode(mode) { return Object.hasOwn(MODES, mode); }
export function playerCount(room) { return room.practice ? 1 : MODES[room.mode].players; }
export function safeName(value) { return String(value || 'Player').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24) || 'Player'; }
export function validSeed(seed) { return Number.isInteger(seed) && seed > 0 && seed <= 2147483647; }
export function normalizedCode(code) { return String(code || '').toUpperCase().replace(/[\s-]/g, ''); }
export function validInput(input) {
  if (!input || !Number.isSafeInteger(input.seq) || input.seq < 1 || input.seq > 0xffffffff) return false;
  return ['throttle', 'steer', 'pitch', 'yaw'].every(k => Number.isFinite(input[k])) &&
    Math.abs(input.throttle) <= 1 && Math.abs(input.steer) <= 1 && Math.abs(input.pitch) <= 90 && Math.abs(input.yaw) <= 160 &&
    (!input.actions || Array.isArray(input.actions) && input.actions.length <= 4 && input.actions.every(action => action &&
      Number.isSafeInteger(action.id) && action.id > 0 && action.id <= 0xffffffff && ['grab', 'door', 'driverDoor', 'tabletMount'].includes(action.kind)));
}
export function newer(seq, previous) { return ((seq - previous) | 0) > 0; }
