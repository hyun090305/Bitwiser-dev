"""Independent Boolean interpreter and exact integer drawing checker."""
from itertools import combinations
ARITY = {"INPUT":0,"OUTPUT":1,"NOT":1,"AND":2,"OR":2,"D":1,"DE":2}

class Circuit:
    def __init__(self, net):
        self.nodes = net['nodes']
        self.by_id = {n['id']: n for n in self.nodes}
        if len(self.by_id) != len(self.nodes): raise ValueError('Duplicate node id')
        self.memories = [n for n in self.nodes if n['type'] in ('D', 'DE')]
        input_names = [n['id'] for n in self.nodes if n['type'] == 'INPUT']
        output_names = [n.get('name', n['id']) for n in self.nodes if n['type'] == 'OUTPUT']
        for n in self.nodes:
            if n['type'] not in ARITY or len(n['inputs']) != ARITY[n['type']]:
                raise ValueError('Invalid primitive or arity: '+n['id'])
            if n['type'] in ('D', 'DE') and n.get('initial', 0) != 0:
                raise ValueError('All memory must start at zero')
            for src in n['inputs']:
                if src not in self.by_id: raise ValueError('Unknown source: '+src)
                if self.by_id[src]['type'] == 'OUTPUT': raise ValueError('Output used as source')
        self.reset()
        self.evaluate({name: 0 for name in input_names})  # Also rejects combinational cycles.

    def reset(self):
        self.state = {n['id']: 0 for n in self.memories}

    def evaluate(self, inputs):
        values = {}; visiting = set()
        def get(ident):
            if ident in values: return values[ident]
            if ident in visiting: raise ValueError('Combinational cycle: '+ident)
            visiting.add(ident)
            n = self.by_id[ident]; kind = n['type']; ins = n['inputs']
            if kind == 'INPUT': value = inputs[ident]
            elif kind in ('D', 'DE'): value = self.state[ident]
            elif kind == 'NOT': value = 1 ^ get(ins[0])
            elif kind == 'AND': value = get(ins[0]) & get(ins[1])
            elif kind == 'OR': value = get(ins[0]) | get(ins[1])
            else: value = get(ins[0])
            if value not in (0, 1): raise ValueError('Non-Boolean value')
            visiting.remove(ident); values[ident] = value
            return value
        for n in self.nodes: get(n['id'])
        return values

    def tick(self, inputs):
        old = self.evaluate(inputs)
        next_state = {}
        for n in self.memories:
            ins = n['inputs']
            enabled = n['type'] == 'D' or old[ins[1]] == 1
            next_state[n['id']] = old[ins[0]] if enabled else self.state[n['id']]
        self.state = next_state
        new = self.evaluate(inputs)
        return {n.get('name', n['id']): new[n['id']] for n in self.nodes if n['type'] == 'OUTPUT'}



def exact_embedding_check(net, cert):
    """No NetworkX dependency: integer arithmetic verifies straight-line edges."""
    positions = {k: tuple(v) for k,v in cert['positions'].items()}
    assert set(positions) == {n['id'] for n in net['nodes']}
    assert len(set(positions.values())) == len(positions)
    edges = sorted({tuple(sorted((n['id'], src))) for n in net['nodes'] for src in n['inputs'] if src != n['id']})
    def cross(a, b, p): return (b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0])
    def on(a, b, p): return cross(a,b,p) == 0 and min(a[0],b[0]) <= p[0] <= max(a[0],b[0]) and min(a[1],b[1]) <= p[1] <= max(a[1],b[1])
    for x,y in edges:
        for k,p in positions.items():
            assert k in (x,y) or not on(positions[x], positions[y], p), ('vertex on edge',k,x,y)
    pairs = 0
    for (x,y),(v,w) in combinations(edges,2):
        if {x,y} & {v,w}: continue
        a,b,c,d = [positions[k] for k in (x,y,v,w)]
        assert not any((on(a,b,c),on(a,b,d),on(c,d,a),on(c,d,b)))
        assert not (cross(a,b,c)*cross(a,b,d) < 0 and cross(c,d,a)*cross(c,d,b) < 0)
        pairs += 1
    return dict(vertices=len(positions), edges=len(edges), disjoint_edge_pairs_checked=pairs,
                intersections=0, nonincident_vertices_on_edges=0)

