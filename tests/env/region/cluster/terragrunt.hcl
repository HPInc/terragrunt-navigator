terraform {
  source = "git::https://github.com/terraform-aws-modules/terraform-aws-eks.git//modules/aws-auth?ref=${read_terragrunt_config(find_in_parent_folders("vpc.hcl")).locals.version}"
}

locals {
  # Basic types
  project_name = "shop"
  primary_zone = "mst"
  secondary_zone = "pst"

  # Lists and maps
  numbers_list = [1, 2, 3]
  extended_numbers_list = concat(local.numbers_list, [4, 5])
  key_value_map = { key1 = "value1", key2 = "value2" }
  nested_list = [
    { key = "value1" },
    { key = "value2" }
  ]

  # Strings and regex
  regex_pattern = "^(?:[A-Za-z0-9+/]{2})*(?:[A-Za-z0-9+/][NSD]==|[A-Za-z0-9+/]{2}[AFASDASDcgkosw048]=)?$"
  quoted_template = "prefix-${local.project_name}-suffix"
  quotes_template = "\"prefix-${local.project_name}-suffix\""
  quotes_string = ":\"START\" => END\""
  quotes_string2 = "\"START\""
  multiline_string = <<EOF
This is a heredoc
It spans multiple lines
EOF

  # Conditional expressions
  primary_region = format("%s-%s-us", local.project_name, local.primary_zone)
  secondary_region = format("%s-%s-us", local.project_name, local.secondary_zone)
  include_failover = true
  region_list = local.include_failover ? [local.primary_region, local.secondary_region] : [local.primary_region]

  # Unary operators and negative numbers
  negative_value = -5
  positive_value = 5
  failover_disabled = !local.include_failover

  # Comparator operations
  is_production = local.project_name == "production"
  is_primary_mst = local.primary_zone == "mst"
  is_secondary_pst = local.secondary_zone == "pst"
  is_greater = local.numbers_list[0] > 5
  is_lesser = local.numbers_list[0] < 5

  # Logical operations
  enable_feature = local.is_production && local.is_primary_mst
  disable_feature = !local.is_production || local.is_secondary_pst

  # binary operators
  sum = local.numbers_list[0] + local.numbers_list[1]
  difference = local.numbers_list[0] - local.numbers_list[1]
  product = local.numbers_list[0] * local.numbers_list[1]
  quotient = local.numbers_list[0] / local.numbers_list[1]
  remainder = local.numbers_list[0] % local.numbers_list[1]

  # Complex structures
  server_instances = [
    { name = "server1", type = "t2.micro", active = true },
    { name = "server2", type = "t2.medium", active = false },
    { name = "server3", type = "t2.large", active = true }
  ]
  user_names = ["Alice", "Bob", local.project_name]

  # Conditional expressions
  kms_key_id = local.is_production ? "production-key" : "development-key"

  region_file = "region.hcl"
  region_vars = read_terragrunt_config(find_in_parent_folders(local.region_file))

  environment_name = "test"
  resource_tags = {
    "Environment" = local.environment_name,
    "Category" = format("Production:Critical-%s", local.environment_name),
  }

  # Nested structures
  network_config = {
    instances = [
      {
        public_ip = "1.1.1.1"
        private_ip = "0.0.0.0"
        hostname = "host1"
        tags = [{ "type" = "web" }, { "type" = "prod" }]
      },
      {
        public_ip = "2.2.2.2"
        private_ip = "0.0.0.0"
        hostname = "host2"
        tags = [{ "type" = "db" }, { "type" = "prod" }]
      },
      {
        public_ip = "3.3.3.3"
        private_ip = "0.0.0.0"
        hostname = "host3"
        tags = [{ "type" = "web" }, { "type" = "dev" }]
      }
    ]
  }
  complex_structure = [
    {
      foo = {
        sub = {
          test = {
            value = ["test1", "test2"]
          }
        }
      }
    },
    {
      foo = {
        sub = {
          test = {
            value = ["test3", "test4"]
          }
        }
      }
    }
  ]

  # Splats
  full_splat = local.network_config.instances[*].tags[0]
  attr_splat = local.complex_structure.*.foo.sub.test.value

  forTuple = [ for name in local.user_names : "Hello, ${name}!" if name == "Bob" ]
  forObject = { for instance in local.server_instances : instance.name => instance.type if instance.active }
}

inputs = {
  region_code = "us-east-1"
}

dependency "vpc" {
  config_path = "../../vpc"
  skip_outputs = true
}

include {
  path = find_in_parent_folders()
}
