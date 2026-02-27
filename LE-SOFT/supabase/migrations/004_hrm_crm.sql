-- Migration: 004_hrm_crm.sql
-- Description: Adds Human Resource Management and Customer Relationship Management tables

-- ==============================================================================
-- 1. HRM (Human Resource Management)
-- ==============================================================================

-- Employees
CREATE TABLE IF NOT EXISTS hrm_employees (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  designation TEXT,
  basic_salary DECIMAL(12,2) DEFAULT 0,
  joined_date DATE,
  status TEXT DEFAULT 'Active', -- Active, Inactive, Terminated
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance
CREATE TABLE IF NOT EXISTS hrm_attendance (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT REFERENCES hrm_employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL, -- Present, Absent, Half Day, Leave
  check_in TIME,
  check_out TIME,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, date) -- An employee can only have one attendance record per day
);

-- Leaves
CREATE TABLE IF NOT EXISTS hrm_leaves (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT REFERENCES hrm_employees(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  type TEXT NOT NULL, -- Sick, Casual, Annual
  status TEXT DEFAULT 'Pending', -- Pending, Approved, Rejected
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payroll
CREATE TABLE IF NOT EXISTS hrm_payroll (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT REFERENCES hrm_employees(id) ON DELETE CASCADE,
  month INT NOT NULL,
  year INT NOT NULL,
  basic_salary DECIMAL(12,2) DEFAULT 0,
  bonus DECIMAL(12,2) DEFAULT 0,
  deductions DECIMAL(12,2) DEFAULT 0,
  net_salary DECIMAL(12,2) DEFAULT 0,
  payment_date DATE,
  status TEXT DEFAULT 'Pending', -- Pending, Paid
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, month, year) -- Only one payroll record per employee per month
);


-- ==============================================================================
-- 2. CRM (Customer Relationship Management)
-- ==============================================================================

-- Customers Directory
CREATE TABLE IF NOT EXISTS crm_customers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customer Progress Tracking Log
CREATE TABLE IF NOT EXISTS crm_tracking (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT REFERENCES crm_customers(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL, -- The employee/user tracking this
  stage TEXT NOT NULL, -- Lead, Contacted, Proposal, Negotiation, Converted, Lost
  notes TEXT,
  next_follow_up DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
