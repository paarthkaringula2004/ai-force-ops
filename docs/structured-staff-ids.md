Staff IDs: YY + department (initially 01–60, then incremental) + E/M + department sequence (minimum two digits) + highest completed qualification.

Example: 2607E01B = 2026, Cybersecurity Engineering, Employee, department sequence 01, highest qualification B.Tech. 2639E01B refers to Legal, department 39.

The initial 60-department catalog is seeded from lib/staff-departments.ts. Runtime catalogs are stored in PostgreSQL; Admin can extend them through Administration > Company catalogs. Position means the E/M account-role marker; the job title is separate and is not encoded.

Sequences are shared by Employees and Managers within a department, across years, and never recycled. They expand to 100 and beyond. Allocation uses atomic PostgreSQL counter updates and the existing unique ID index. Year uses IST and is retained when an ID changes. Internal account IDs remain unchanged, keeping requests, sessions and relationships intact.

Promotion changes E to M while retaining the department sequence. Changing department allocates a sequence in the new department; changing the highest completed qualification changes the suffix. Previous nonempty IDs are saved in staff_id_history. History is deleted with the account, but counters remain.

Qualification codes use distinct abbreviations: B = B.Tech, MTECH = M.Tech, MBA = MBA, MCA = MCA, MSC = M.Sc., PHD = PhD, and the full selectable catalog in lib/staff-departments.ts. See docs/qualification-catalog.md for all distinct degree suffixes. The suffix can contain multiple letters; use the highest completed qualification, not a course currently being studied. B.Tech is backfilled for existing staff as authorized; future staff require a department and qualification selected by Admin. Employee IDs issue on employment confirmation; Manager IDs issue on role assignment. Admin IDs and User account IDs are unchanged.

Verify using node tests/structured-staff-ids.mjs. Test fixtures and counter changes are rolled back.
