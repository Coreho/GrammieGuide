param(
  [Parameter(Mandatory = $true)][string]$Executable,
  [Parameter(Mandatory = $true)][string]$PromptFile,
  [int]$OwnerProcessId = 0,
  [switch]$Fixture
)
$ErrorActionPreference = 'Stop'

# Assign this supervisor before spawning anything. Every descendant joins the job,
# even if its immediate parent later exits. Killing this process closes the job's
# only handle and terminates the entire tree. Fail closed if isolation fails.
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
public static class WorkflowJob {
    [StructLayout(LayoutKind.Sequential)] struct Basic {
        public long ProcessTime, JobTime;
        public uint Flags;
        public UIntPtr MinWorkingSet, MaxWorkingSet;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)] struct IO {
        public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
    }
    [StructLayout(LayoutKind.Sequential)] struct Extended {
        public Basic Basic;
        public IO IO;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref Extended info, uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    static IntPtr job;
    public static void Own(int ownerPid) {
        job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) throw new Win32Exception();
        var limits = new Extended();
        limits.Basic.Flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits))) throw new Win32Exception();
        if (!AssignProcessToJobObject(job, Process.GetCurrentProcess().Handle)) throw new Win32Exception();
        if (ownerPid > 0) {
            var owner = Process.GetProcessById(ownerPid);
            // Capture a process handle now, so PID reuse cannot adopt a new process.
            var handle = owner.Handle;
            var watcher = new Thread(() => { owner.WaitForExit(); Environment.Exit(1); });
            watcher.IsBackground = true;
            watcher.Start();
        }
    }
}
'@
[WorkflowJob]::Own($OwnerProcessId)
if ($Fixture) {
  # Only used by local process-isolation tests; never selected by the board runner.
  & $Executable $PromptFile
} else {
  $prompt = Get-Content -LiteralPath $PromptFile -Raw -Encoding UTF8
  # Preserve local permission settings (currently auto). A prompt that still needs
  # a human is denied in this headless run, never silently escalated to bypass.
  $prompt | & $Executable --print --output-format json --permission-prompts none
}
exit $LASTEXITCODE
