import subprocess
import sys
import json

def run_incremental():
    N = 100
    while N <= 1000:
        print(f"--- Running Iteration N={N} ---")
        # 1. Generate noisy cases
        subprocess.run([sys.executable, "create_n10000.py", str(N)], check=True)
        
        data_file = f"fishtest_N{N}_mutated.json"
        
        # 2. Compile Zero-Point Matrix for the new data
        compile_script = f"import create_router\ncreate_router.compile_zero_point('{data_file}', 'src/core/engine/zero_point.py')\n"
        with open("tmp_compile.py", "w") as f:
            f.write(compile_script)
        subprocess.run([sys.executable, "tmp_compile.py"], check=True)
        
        # 3. Run Fishtest
        print(f"Running fishtest on {data_file}")
        res = subprocess.run([sys.executable, "tests/integration/fishtest.py", "--file", data_file], capture_output=True, text=True, encoding='utf-8')
        
        print(res.stdout)
        if res.returncode != 0:
            print(f"[FAIL] Incremental run failed at N={N}")
            break
            
        N += 50
        
if __name__ == "__main__":
    run_incremental()
