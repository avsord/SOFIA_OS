// Drive flutuante so existe no site (no app o Drive e uma tela inteira).
import type {SofiaApi} from '../lib/api';
export function openDriveWindow() {}
export function closeDriveWindow() {}
export function useDriveWindowOpen() { return false; }
export function DriveWindowHost(_: {api: SofiaApi}) { return null; }
