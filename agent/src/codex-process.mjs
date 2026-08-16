import process from "node:process";

export function signalProcessTree(child, signal, {
  platform = process.platform,
  kill = process.kill,
} = {}) {
  if (!child?.pid) return false;

  if (platform !== "win32") {
    try {
      kill(-child.pid, signal);
      return true;
    } catch (error) {
      if (error?.code === "ESRCH") return false;
    }
  }

  try {
    return child.kill(signal);
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}
