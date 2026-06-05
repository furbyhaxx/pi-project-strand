# Pi Project Strand (PPS) Redesign


## Data

### Hierarchy

```
Workspace // A workspace is an optional housing for multiple projects/parts
- flow_templates?
- members: Project[]  // A project is the primary work target that must be explicitely activated by calling the project_set_current tool
-- flow_templates?
-- strands: Strand[] // A strand is a collection of slices where there can be only one primary strand and multiple secondary/side strands
--- name: string
--- description: string
--- primary: bool

```