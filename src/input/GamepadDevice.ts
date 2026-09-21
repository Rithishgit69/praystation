import type { Action, ControlProfile, InputDevice, InputFrame } from './types';

const DEADZONE = 0.15;
const STICK_LOOK_SPEED = 900; // pixels-equivalent per second at full deflection

/**
 * Standard-mapping gamepad. Missions: A / Y jump, B dodge, X reload, LB / L3 run, LT aim, RT fire,
 * D-pad ◀ ▶ switch weapon, Back controls, Start pause. Story mode adds A interact, RB crouch, X block
 * (no weapon), Back map, D-pad up journal and R3 camera reset.
 */
const MISSION_BUTTONS: Record<number, Action> = { 0: 'jump', 1: 'dodge', 2: 'reload', 3: 'jump', 4: 'sprint', 6: 'aim', 7: 'fire', 8: 'help', 9: 'pause', 10: 'sprint', 14: 'weaponPrev', 15: 'weaponNext' };
const STORY_BUTTONS: Record<number, Action> = { 0: 'interact', 1: 'dodge', 2: 'block', 3: 'jump', 4: 'sprint', 5: 'crouch', 6: 'aim', 7: 'fire', 8: 'map', 9: 'pause', 10: 'sprint', 11: 'cameraReset', 12: 'journal', 14: 'weaponPrev', 15: 'weaponNext' };
const PROFILES: Record<ControlProfile, Record<number, Action>> = { missions: MISSION_BUTTONS, story: STORY_BUTTONS };

const radialDeadzone = (x: number, y: number): [number, number] => {
  const m = Math.hypot(x, y);
  if (m < DEADZONE) return [0, 0];
  const s = Math.min(1, (m - DEADZONE) / (1 - DEADZONE)) / m;
  return [x * s, y * s];
};

export class GamepadDevice implements InputDevice {
  readonly kind = 'gamepad' as const;
  connected = false;
  private buttons: Record<number, Action> = PROFILES.missions;
  setProfile(profile: ControlProfile): void {
    this.buttons = PROFILES[profile];
  }
  private readonly onConnect = (): void => {
    this.connected = true;
    this.onConnectionChange(true);
  };
  private readonly onDisconnect = (): void => {
    this.connected = navigator.getGamepads().some((g) => g !== null);
    this.onConnectionChange(this.connected);
  };
  private readonly onConnectionChange: (connected: boolean) => void;

  constructor(onConnectionChange: (connected: boolean) => void) {
    this.onConnectionChange = onConnectionChange;
    window.addEventListener('gamepadconnected', this.onConnect);
    window.addEventListener('gamepaddisconnected', this.onDisconnect);
    this.connected = navigator.getGamepads().some((g) => g !== null);
  }

  poll(frame: InputFrame, dt: number): boolean {
    const pads = navigator.getGamepads();
    let any = false;
    for (const pad of pads) {
      if (!pad || pad.mapping !== 'standard') continue;
      const [mx, my] = radialDeadzone(pad.axes[0] ?? 0, -(pad.axes[1] ?? 0));
      const [lx, ly] = radialDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
      frame.moveX += mx;
      frame.moveY += my;
      // Response curve for fine aiming near centre.
      const curve = (v: number): number => Math.sign(v) * v * v;
      frame.lookX += curve(lx) * STICK_LOOK_SPEED * dt;
      frame.lookY += curve(ly) * STICK_LOOK_SPEED * dt;
      if (Math.hypot(mx, my) > 0.92) frame.stickSprint = true;
      for (let i = 0; i < pad.buttons.length; i++) {
        const b = pad.buttons[i];
        if (!b?.pressed) continue;
        const a = this.buttons[i];
        if (a) frame.held.add(a);
        if (i === 2) frame.held.add('reload');
        any = true;
      }
      // Select + Start together opens the dev menu.
      if (pad.buttons[8]?.pressed && pad.buttons[9]?.pressed) frame.held.add('devmenu');
      if (mx !== 0 || my !== 0 || lx !== 0 || ly !== 0) any = true;
    }
    return any;
  }

  dispose(): void {
    window.removeEventListener('gamepadconnected', this.onConnect);
    window.removeEventListener('gamepaddisconnected', this.onDisconnect);
  }
}
