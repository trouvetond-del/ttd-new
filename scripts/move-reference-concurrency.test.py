"""Run against the isolated DB initialized by move-reference-db.test.sql only."""
import concurrent.futures
import subprocess

def sql(statement):
    return subprocess.check_output([
        'psql', '-h', '/tmp/ref-pg-socket', '-p', '55439', '-U', 'lovable',
        '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atc', statement
    ], text=True).strip()

before = int(sql('SELECT count(*) FROM public.quote_requests'))
with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
    list(pool.map(lambda _: sql('INSERT INTO public.quote_requests (id) SELECT gen_random_uuid() FROM generate_series(1, 100)'), range(16)))
assert int(sql('SELECT count(*) FROM public.quote_requests')) == before + 1600
assert sql("SELECT count(*) = count(DISTINCT reference) AND bool_and(reference ~ '^TTD-[0-9]{6}$') FROM public.quote_requests") == 't'
print('PASS: 1600 concurrent allocations, exactly six numeric digits, zero duplicates')