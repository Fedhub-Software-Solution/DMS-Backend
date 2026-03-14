-- Pharma DMS Phase 1.5 – Workflows & Libraries (workflow definitions and runtime)
-- Run with: node src/db/runMigrations.js

-- Workflow definitions (per template/department or generic)
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  applies_to_template_id UUID REFERENCES templates(id),
  applies_to_department_id UUID REFERENCES departments(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_template ON workflows(applies_to_template_id);
CREATE INDEX IF NOT EXISTS idx_workflows_department ON workflows(applies_to_department_id);
CREATE INDEX IF NOT EXISTS idx_workflows_active ON workflows(is_active);

-- Ordered steps within a workflow
CREATE TABLE IF NOT EXISTS workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  step_order INT NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  role_key TEXT,
  department_id UUID REFERENCES departments(id),
  is_approval_step BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON workflow_steps(workflow_id);

-- Rules for selecting workflows (condition/action)
CREATE TABLE IF NOT EXISTS workflow_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  applies_to_template_id UUID REFERENCES templates(id),
  applies_to_department_id UUID REFERENCES departments(id),
  condition_json JSONB NOT NULL DEFAULT '{}',
  action_json JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_rules_template ON workflow_rules(applies_to_template_id);
CREATE INDEX IF NOT EXISTS idx_workflow_rules_department ON workflow_rules(applies_to_department_id);

-- Runtime: workflow instance attached to a request
CREATE TABLE IF NOT EXISTS request_workflow_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES workflows(id),
  ai_generated_definition JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(request_id)
);

CREATE INDEX IF NOT EXISTS idx_request_workflow_instances_request ON request_workflow_instances(request_id);
CREATE INDEX IF NOT EXISTS idx_request_workflow_instances_workflow ON request_workflow_instances(workflow_id);

-- Runtime: step state per request workflow
CREATE TABLE IF NOT EXISTS request_workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_workflow_instance_id UUID NOT NULL REFERENCES request_workflow_instances(id) ON DELETE CASCADE,
  step_order INT NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  assigned_to_user_id UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'current', 'completed', 'rejected')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_request_workflow_steps_instance ON request_workflow_steps(request_workflow_instance_id);
