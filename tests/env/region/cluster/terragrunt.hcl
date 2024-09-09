
terraform {
  source = "git::https://github.com/terraform-aws-modules/terraform-aws-eks.git//modules/aws-auth?ref=${read_terragrunt_config(find_in_parent_folders("vpc.hcl")).locals.version}"
}


locals {
  type  = "shop"
  zone1 = "mst"
  zone2 = "pst"

  a = [1, 2]
  b = [local.a, 3]
  c = { a = 1, b = 2 }
  d = [
    { c = 5 },
    { d = 7 }
  ]
  primary       = format("%s-%s-us", local.type, local.zone1)
  secondary     = format("%s-%s-us", local.type, local.zone2)
  add_failover  = false
  cluster_names = local.add_failover ? [local.primary, local.secondary] : [local.primary]

  # Unary operators and negative numbers
  negative_number = -5
  positive_number = +5
  not_add_failover = !local.add_failover

  # Comparator operations
  is_production = local.type == "production"
  is_mst_zone   = local.zone1 == "mst"
  is_pst_zone   = local.zone2 == "pst"
  is_a_greater_than_b = local.a[0] > 5

  # Logical operations
  enable_feature = local.is_production && local.is_mst_zone
  disable_feature = !local.is_production || local.is_pst_zone
  instances = [
    { name = "instance1", type = "t2.micro", active = true },
    { name = "instance2", type = "t2.medium", active = false },
    { name = "instance3", type = "t2.large", active = true }
  ]
  names = ["Alice", "Bob", "Charlie"]
  kms_key_id = var.kms_key_id == null ? module.kms_key[10].key_id : var.kms_key_id
}

output "greetings" {
  value = [for name in local.names : "Hello, ${name}!" if name == "Bob"]
  active_instances = {
    for instance in local.instances :
    instance.name => instance.type
    if instance.active
  }
}

include {
  path = find_in_parent_folders()
}

dependency "vpc" {
  config_path = "../../vpc"
}

inputs = {
  region_code = "us-east-1"
}
