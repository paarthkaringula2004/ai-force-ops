ALTER TABLE workspace_members DROP CONSTRAINT workspace_members_department_code_fkey;
ALTER TABLE staff_department_counters DROP CONSTRAINT staff_department_counters_department_code_fkey;
ALTER TABLE staff_departments DROP CONSTRAINT staff_departments_code_check;
ALTER TABLE staff_departments ALTER COLUMN code TYPE integer;
ALTER TABLE workspace_members ALTER COLUMN department_code TYPE integer;
ALTER TABLE staff_department_counters ALTER COLUMN department_code TYPE integer;
ALTER TABLE staff_departments ADD CHECK(code>0);
ALTER TABLE workspace_members ADD FOREIGN KEY(department_code) REFERENCES staff_departments(code);
ALTER TABLE staff_department_counters ADD FOREIGN KEY(department_code) REFERENCES staff_departments(code);
CREATE UNIQUE INDEX staff_departments_normalized_name ON staff_departments(lower(trim(name)));
CREATE TABLE staff_qualifications(id integer PRIMARY KEY,code text UNIQUE NOT NULL CHECK(code ~ '^[A-Z]{1,16}$'),name text NOT NULL);
CREATE UNIQUE INDEX staff_qualifications_normalized_name ON staff_qualifications(lower(trim(name)));
INSERT INTO staff_qualifications(id,code,name) VALUES (1,'B','B.Tech'),(2,'BE','B.E.'),(3,'BSC','B.Sc.'),(4,'BCA','BCA'),(5,'BBA','BBA'),(6,'BCOM','B.Com.'),(7,'BA','B.A.'),(8,'BFA','BFA'),(9,'BPHARM','B.Pharm.'),(10,'MBBS','MBBS'),(11,'BDS','BDS'),(12,'BARCH','B.Arch.'),(13,'LLB','LLB'),(14,'MTECH','Master of Technology (M.Tech)'),(15,'ME','Master of Engineering (M.E.)'),(16,'MBA','Master of Business Administration'),(17,'MSC','Master of Science (M.Sc.)'),(18,'MCA','Master of Computer Applications'),(19,'MCOM','Master of Commerce'),(20,'MA','Master of Arts'),(21,'MFA','Master of Fine Arts'),(22,'MPHARM','Master of Pharmacy'),(23,'MD','Doctor of Medicine (MD)'),(24,'MSURG','Master of Surgery (MS)'),(25,'MARCH','Master of Architecture'),(26,'LLM','Master of Laws'),(27,'PHD','PhD'),(28,'DBA','Doctor of Business Administration'),(29,'DIP','Diploma'),(30,'PGDIP','Postgraduate Diploma'),(31,'CERT','Certificate'),(32,'SSC','Secondary school'),(33,'HSC','Higher secondary school'),(34,'D','Other bachelor''s degree'),(35,'MS','Master of Science (MS)'),(36,'MENG','Master of Engineering (MEng)'),(37,'MSW','Master of Social Work'),(38,'MPH','Master of Public Health'),(39,'MED','Master of Education'),(40,'MDES','Master of Design'),(41,'MPLAN','Master of Planning'),(42,'MPA','Master of Public Administration'),(43,'MPP','Master of Public Policy'),(44,'MHRM','Master of Human Resource Management'),(45,'MFIN','Master of Finance'),(46,'MIM','Master in Management'),(47,'MLIS','Master of Library and Information Science'),(48,'MSTAT','Master of Statistics'),(49,'MPHIL','Master of Philosophy'),(50,'MRES','Master of Research'),(51,'MDS','Master of Dental Surgery'),(52,'MPT','Master of Physiotherapy'),(53,'MOT','Master of Occupational Therapy'),(54,'MVSC','Master of Veterinary Science'),(55,'MHA','Master of Hospital / Health Administration'),(56,'MHM','Master of Hotel Management'),(57,'MTTM','Master of Travel and Tourism Management'),(58,'MFM','Master of Fashion Management'),(59,'MPE','Master of Physical Education'),(60,'MTHEO','Master of Theology');
ALTER TABLE workspace_members DROP CONSTRAINT workspace_members_qualification_code_check;
CREATE TABLE staff_job_titles(id integer PRIMARY KEY,name text NOT NULL,department_code integer NOT NULL REFERENCES staff_departments(code));
CREATE UNIQUE INDEX staff_job_titles_normalized_name ON staff_job_titles(department_code,lower(trim(name)));
ALTER TABLE workspace_members ADD COLUMN job_title_id integer REFERENCES staff_job_titles(id);
CREATE TABLE staff_catalog_counters(kind text PRIMARY KEY CHECK(kind IN ('department','qualification','job_title')),last_value integer NOT NULL CHECK(last_value>=0));
INSERT INTO staff_catalog_counters VALUES('department',60),('qualification',60),('job_title',0);
CREATE FUNCTION validate_staff_qualification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.qualification_code<>'' AND NOT EXISTS(SELECT 1 FROM staff_qualifications WHERE code=NEW.qualification_code) THEN RAISE EXCEPTION 'Unknown qualification code' USING ERRCODE='23503'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER staff_qualification_valid BEFORE INSERT OR UPDATE ON workspace_members FOR EACH ROW EXECUTE FUNCTION validate_staff_qualification();
CREATE OR REPLACE FUNCTION assign_structured_staff_id() RETURNS trigger LANGUAGE plpgsql AS $$
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
 generated := right(NEW.staff_id_year::text,2)||lpad(NEW.department_code::text,greatest(2,length(NEW.department_code::text)),'0')||
  CASE WHEN NEW.role='manager' THEN 'M' ELSE 'E' END||
  CASE WHEN length(count_text)<2 THEN lpad(count_text,2,'0') ELSE count_text END||NEW.qualification_code;
 NEW.employee_id := generated;
 IF previous<>'' AND previous<>generated THEN
  INSERT INTO staff_id_history(user_id,old_id,new_id) VALUES(NEW.user_id,previous,generated);
 END IF;
 RETURN NEW;
END $$;
