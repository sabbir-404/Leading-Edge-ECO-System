-- Migration 016: Add auto-generated employee_code to hrm_employees

ALTER TABLE public.hrm_employees
ADD COLUMN IF NOT EXISTS employee_code VARCHAR(20) UNIQUE;

-- Create an internal sequence to guarantee unique incrementing EMP-IDs
CREATE SEQUENCE IF NOT EXISTS emp_code_seq START WITH 1;

-- Function to perfectly auto-generate EMP-XXX logic on insert
CREATE OR REPLACE FUNCTION generate_employee_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.employee_code IS NULL OR NEW.employee_code = '' THEN
        NEW.employee_code := 'EMP-' || LPAD(nextval('emp_code_seq')::text, 3, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to execute before insert
DROP TRIGGER IF EXISTS trg_generate_emp_code ON public.hrm_employees;
CREATE TRIGGER trg_generate_emp_code
BEFORE INSERT ON public.hrm_employees
FOR EACH ROW
EXECUTE FUNCTION generate_employee_code();

-- Update existing rows (if any) with an ID to avoid nulls
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.hrm_employees WHERE employee_code IS NULL ORDER BY created_at ASC LOOP
        UPDATE public.hrm_employees
        SET employee_code = 'EMP-' || LPAD(nextval('emp_code_seq')::text, 3, '0')
        WHERE id = r.id;
    END LOOP;
END;
$$;
