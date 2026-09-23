// GrammieGuide - volume ceiling enforcement fallback.
//
// Only used if the `loudness` native module is unavailable/unreliable on the
// target machine. Compiled at runtime via PowerShell's Add-Type and invoked
// through shellExec.ts - kept as a static ASCII file (not an inline JS
// template literal like the old app's index.js) so a stray non-ASCII
// character can never silently break Add-Type's compile step.

using System;
using System.Runtime.InteropServices;

namespace GrammieGuide
{
    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioEndpointVolume
    {
        int NotImpl1();
        int NotImpl2();
        int GetChannelCount(out uint count);
        int SetMasterVolumeLevel(float level, Guid eventContext);
        int SetMasterVolumeLevelScalar(float level, Guid eventContext);
        int GetMasterVolumeLevel(out float level);
        int GetMasterVolumeLevelScalar(out float level);
        int SetChannelVolumeLevel(uint index, float level, Guid eventContext);
        int SetChannelVolumeLevelScalar(uint index, float level, Guid eventContext);
        int GetChannelVolumeLevel(uint index, out float level);
        int GetChannelVolumeLevelScalar(uint index, out float level);
        int SetMute(bool mute, Guid eventContext);
        int GetMute(out bool mute);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDevice
    {
        int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
    }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceEnumerator
    {
        int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppEndpoint);
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    public class MMDeviceEnumeratorComObject
    {
    }

    public static class VolumeHelper
    {
        public static void EnforceCeiling(int ceilingPercent)
        {
            var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
            IMMDevice device;
            enumerator.GetDefaultAudioEndpoint(0, 1, out device);

            var iidVolume = typeof(IAudioEndpointVolume).GUID;
            object volumeObj;
            device.Activate(ref iidVolume, 0, IntPtr.Zero, out volumeObj);
            var volume = (IAudioEndpointVolume)volumeObj;

            float current;
            volume.GetMasterVolumeLevelScalar(out current);
            float ceiling = ceilingPercent / 100f;
            if (current > ceiling)
            {
                volume.SetMasterVolumeLevelScalar(ceiling, Guid.Empty);
            }
        }
    }
}
