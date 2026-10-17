CREATE TABLE staff_departments (
    code smallint PRIMARY KEY CHECK (code BETWEEN 1 AND 60),
    name text UNIQUE NOT NULL
);

INSERT INTO
    staff_departments
VALUES
    (1, 'Software Engineering'),
    (2, 'Mobile Applications'),
    (3, 'Quality Engineering'),
    (4, 'Artificial Intelligence'),
    (5, 'Data Engineering'),
    (6, 'Data Science and Analytics'),
    (7, 'Cybersecurity Engineering'),
    (8, 'Security Operations'),
    (9, 'Offensive Security'),
    (10, 'Governance, Risk and Compliance'),
    (11, 'Cloud Engineering'),
    (12, 'DevOps and Platform Engineering'),
    (13, 'Site Reliability Engineering'),
    (14, 'Network Engineering'),
    (15, 'Compute and Operating Systems'),
    (16, 'Storage, Backup and Recovery'),
    (17, 'Database Administration'),
    (18, 'IT Support and Service Desk'),
    (19, 'IT Service Management'),
    (20, 'Enterprise Applications'),
    (21, 'Automation and Integration'),
    (22, 'Product Management'),
    (23, 'Design and User Research'),
    (24, 'Project and Program Delivery'),
    (25, 'Business Analysis and Consulting'),
    (26, 'Research and Development'),
    (27, 'Technical Documentation'),
    (28, 'Customer Success'),
    (29, 'Customer Support'),
    (30, 'Sales and Business Development'),
    (31, 'Marketing and Communications'),
    (32, 'Partnerships'),
    (33, 'Human Resources'),
    (34, 'Recruitment'),
    (35, 'Learning and Development'),
    (36, 'Compensation and Payroll'),
    (37, 'Finance and Accounting'),
    (38, 'Treasury and Tax'),
    (39, 'Legal'),
    (40, 'Procurement and Vendor Management'),
    (41, 'Administration and Facilities'),
    (42, 'Corporate Strategy and Operations'),
    (43, 'Internal Audit and Enterprise Risk'),
    (44, 'Trust, Safety and Responsible AI'),
    (45, 'Hardware and Electronics'),
    (46, 'Robotics and Industrial Automation'),
    (47, 'Mechanical and Manufacturing'),
    (48, 'Civil and Construction'),
    (49, 'Electrical and Energy'),
    (50, 'Aerospace and Aviation'),
    (51, 'Supply Chain and Logistics'),
    (52, 'Environment, Health and Safety'),
    (53, 'Healthcare and Clinical Services'),
    (54, 'Education and Academic Services'),
    (55, 'Scientific and Laboratory Services'),
    (56, 'Agriculture and Food Systems'),
    (57, 'Hospitality and Travel'),
    (58, 'Retail and Commerce'),
    (59, 'Media and Creative Production'),
    (60, 'Public and Community Services');

ALTER TABLE workspace_members
ADD COLUMN department_code smallint REFERENCES staff_departments (code),
ADD COLUMN qualification_code text NOT NULL DEFAULT '' CHECK (
    qualification_code IN ('', 'B', 'D', 'M', 'P', 'I', 'C', 'S')
),
ADD COLUMN staff_id_year integer,
ADD COLUMN staff_sequence bigint;

CREATE TABLE staff_department_counters (
    department_code smallint PRIMARY KEY REFERENCES staff_departments (code),
    last_value bigint NOT NULL
);

CREATE TABLE staff_id_history (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    old_id text NOT NULL,
    new_id text NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now()
);

-- Department sequences are shared by employees/managers and never recycled.
CREATE FUNCTION assign_structured_staff_id () RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE generated text; previous text := ''; count_text text;
BEGIN
 IF TG_OP='UPDATE' THEN previous := OLD.employee_id; END IF;
 IF NEW.role NOT IN ('employee','manager') THEN RETURN NEW; END IF;
 IF NEW.department_code IS NULL OR NEW.qualification_code='' THEN RETURN NEW; END IF;
 IF NEW.role='employee' AND NEW.employment_verified_at IS NULL THEN RETURN NEW; END IF;
 IF NEW.staff_sequence IS NULL OR (TG_OP='UPDATE' AND NEW.department_code IS DISTINCT FROM OLD.department_code) THEN
  INSERT INTO staff_department_counters VALUES(NEW.department_code,1)
  ON CONFLICT(department_code) DO UPDATE SET last_value=staff_department_counters.last_value+1
  RETURNING last_value INTO NEW.staff_sequence;
 END IF;
 NEW.staff_id_year := COALESCE(NEW.staff_id_year,extract(year FROM now() AT TIME ZONE 'Asia/Kolkata')::integer);
 count_text := NEW.staff_sequence::text;
 generated := right(NEW.staff_id_year::text,2)||lpad(NEW.department_code::text,2,'0')||
  CASE WHEN NEW.role='manager' THEN 'M' ELSE 'E' END||
  CASE WHEN length(count_text)<2 THEN lpad(count_text,2,'0') ELSE count_text END||NEW.qualification_code;
 NEW.employee_id := generated;
 IF previous<>'' AND previous<>generated THEN
  INSERT INTO staff_id_history(user_id,old_id,new_id) VALUES(NEW.user_id,previous,generated);
 END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER workspace_structured_staff_id
BEFORE INSERT OR UPDATE ON workspace_members FOR EACH ROW
EXECUTE FUNCTION assign_structured_staff_id ();

-- Only the user-authorized existing staff receive the B.Tech backfill.
UPDATE workspace_members m
SET
    department_code = d.code,
    qualification_code = 'B',
    updated_at = now()
FROM
    staff_departments d
WHERE
    m.role IN ('employee', 'manager')
    AND (
        lower(trim(m.department)) = lower(d.name)
        OR (
            d.code = 1
            AND lower(trim(m.department)) = 'software development role'
        )
    );