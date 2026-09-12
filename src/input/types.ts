import type { InputDeviceKind } from '@/engine/types';

export type Action =
  | 'interact'
  | 'sprint'
  | 'jump'
  | 'crouch'
  | 'dodge'
  | 'block'
  | 'pause'
  | 'journal'
  | 'map'
  | 'devmenu'
  | 'profiler'
  | 'cameraReset';

export const ACTIONS: readonly Action[] = ['interact', 'sprint', 'jump', 'crouch', 'dodge', 'block', 'pause', 'journal', 'map', 'devmenu', 'profiler', 'cameraReset'];

/** One frame of merged input. `look` is an unscaled delta (radians before sensitivity); stick look is already scaled by dt. */
export interface InputFrame {
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  /** True while the stick is pushed past the sprint threshold (touch/gamepad). */
  stickSprint: boolean;
  held: Set<Action>;
  device: InputDeviceKind;
}

export interface InputDevice {
  readonly kind: InputDeviceKind;
  /** Accumulate this device's contribution into the frame. Return true if the device produced any input. */
  poll(frame: InputFrame, dt: number): boolean;
  dispose(): void;
}
