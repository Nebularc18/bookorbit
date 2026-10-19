#!/usr/bin/env python3
"""Linux integration checks; use small transient scopes, never app services."""
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
import unittest

ROOT=Path(__file__).resolve().parent
WRAPPER=ROOT/"with-resource-limits.mjs"
ENV={**os.environ,"BOOKORBIT_RESOURCE_GUARD":"1","BOOKORBIT_CHECK_MEMORY_MB":"64"}

def command(*args):
    return ["node",str(WRAPPER),"--",*args]

def run(*args,timeout=15):
    return subprocess.run(command(*args),env=ENV,capture_output=True,text=True,timeout=timeout)

class GuardTests(unittest.TestCase):
    def test_exit_status(self):
        self.assertEqual(run("python3","-c","raise SystemExit(7)").returncode,7)

    def test_scope_is_separate(self):
        result=run("python3","-c","print(open('/proc/self/cgroup').read())")
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn("bookorbit-checks.slice",result.stdout)
        self.assertNotIn("app-t3code-agents.slice",result.stdout)

    def test_dev_scope_is_separate(self):
        result=subprocess.run(["node",str(WRAPPER),"--dev","--","python3","-c","print(open('/proc/self/cgroup').read())"],env=ENV,capture_output=True,text=True,timeout=15)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn("bookorbit-dev.slice",result.stdout)

    def test_memory_failure_releases_lock(self):
        result=run("python3","-c","a=bytearray(192*1024*1024); print(len(a))")
        self.assertNotEqual(result.returncode,0)
        self.assertEqual(run("/bin/true").returncode,0)

    def test_nested_checks_do_not_deadlock(self):
        self.assertEqual(run("node",str(WRAPPER),"--","/bin/true").returncode,0)

    def test_serialization(self):
        with tempfile.TemporaryDirectory() as directory:
            log=Path(directory)/"events"
            code="import time; p="+repr(str(log))+"; f=open(p,'a',buffering=1); f.write('start\\n'); time.sleep(.4); f.write('end\\n')"
            first=subprocess.Popen(command("python3","-c",code),env=ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            second=subprocess.Popen(command("python3","-c",code),env=ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            self.assertEqual(first.wait(timeout=10),0)
            self.assertEqual(second.wait(timeout=10),0)
            self.assertEqual(log.read_text().splitlines(),["start","end","start","end"])

    def test_timeout_and_cleanup(self):
        result=subprocess.run(["node",str(WRAPPER),"--run-timeout=250","--","sleep","30"],env=ENV,capture_output=True,timeout=10)
        self.assertEqual(result.returncode,124)
        self.assertEqual(run("/bin/true").returncode,0)

    def test_signal_stops_child_and_releases_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            pidfile=Path(directory)/"pid"
            code="import os,time; open("+repr(str(pidfile))+",'w').write(str(os.getpid())); time.sleep(30)"
            p=subprocess.Popen(command("python3","-c",code),env=ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            try:
                for _ in range(100):
                    if pidfile.exists(): break
                    time.sleep(.05)
                self.assertTrue(pidfile.exists())
                child=int(pidfile.read_text())
                p.send_signal(signal.SIGTERM)
                p.wait(timeout=10)
                for _ in range(40):
                    if not Path("/proc/"+str(child)).exists(): break
                    time.sleep(.05)
                self.assertFalse(Path("/proc/"+str(child)).exists())
                self.assertEqual(run("/bin/true").returncode,0)
            finally:
                if p.poll() is None: p.kill()

if __name__=="__main__":
    unittest.main(verbosity=2)
