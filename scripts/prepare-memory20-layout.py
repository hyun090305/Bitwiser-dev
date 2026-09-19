"""Optional layout authoring helper: pip install networkx==3.6.1.

Break high fan-out into planar junction trees before integer layout. Runtime
and verification do not depend on NetworkX; generated fixtures are checked in.
"""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path('test-results/python-libs').resolve()))
import networkx as nx

root = Path('docs/handoff-20')
out = Path('test-results/memory20-layout')
out.mkdir(parents=True, exist_ok=True)
for entry in json.loads((root/'catalog.json').read_text(encoding='utf8')):
    net = json.loads((root/entry['circuit']).read_text(encoding='utf8'))
    cert = json.loads((root/entry['certificate']).read_text(encoding='utf8'))
    by_id = {n['id']: n for n in net['nodes']}
    for node in list(net['nodes']):
        ident = node['id']
        incoming = set(node['inputs'])
        outgoing = {n['id'] for n in net['nodes'] if ident in n['inputs']}
        if len(incoming) + len(outgoing) <= 4:
            continue
        rotation = cert['rotation'][ident]
        # Start just after an incoming edge so a cyclic output run stays whole.
        if incoming:
            start = next(i for i, n in enumerate(rotation) if n in incoming)
            rotation = rotation[start+1:] + rotation[:start+1]
        runs = [[]]
        for target in rotation:
            if target in outgoing:
                runs[-1].append(target)
            else:
                runs.append([])
        for run_index, run in enumerate(filter(None, runs)):
            previous = ident
            for i, target in enumerate(run):
                if i < len(run)-1:
                    branch = f'fan_{ident}_{run_index}_{i}'
                    added = dict(id=branch, type='JUNCTION', inputs=[previous])
                    net['nodes'].append(added); by_id[branch] = added
                    previous = branch
                by_id[target]['inputs'] = [previous if source == ident else source for source in by_id[target]['inputs']]
    # Two equal DE pins still need two physical endpoints/roles in the editor.
    for node in list(net['nodes']):
        seen = set()
        for i, source in enumerate(node['inputs']):
            if source in seen:
                branch = f"pin_{node['id']}_{i}"
                net['nodes'].append(dict(id=branch,type='JUNCTION',inputs=[source]))
                node['inputs'][i] = branch
            seen.add(source)
    graph = nx.Graph()
    for n in net['nodes']:
        graph.add_node(n['id'])
        for source in n['inputs']:
            graph.add_edge(source, n['id'])
    planar, embedding = nx.check_planarity(graph)
    assert planar, entry['slot']
    positions=nx.combinatorial_embedding_to_pos(embedding,fully_triangulate=True)
    derived = dict(positions={k:list(v) for k,v in positions.items()})
    (out/f"{entry['slot']}.json").write_text(json.dumps(dict(net=net,certificate=derived)),encoding='utf8')
    print(entry['slot'],len(net['nodes']),max(dict(graph.degree()).values()),flush=True)
