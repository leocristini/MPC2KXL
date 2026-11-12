// Shared namespace and MPC2000XL constants. Loaded first.
// Plain scripts (not ES modules) so index.html still works when opened from disk (file://).
window.MPC = window.MPC || {};

MPC.RATE = 44100;          // MPC2000XL native sample rate
MPC.NAME_LENGTH = 8;       // max sound/file name length
MPC.WAV_HEADER = 44;       // bytes
MPC.SND_HEADER = 42;       // bytes
