
locals {
  vpc_name               = format("%s-%s-vpc", var.environment, var.region_code)
  non_vpc_resource_count = var.vpc_only_region ? 0 : 1
  availability_zones     = length(var.availability_zones) == 0 ? slice(data.aws_availability_zones.available.names, 0, 3) : var.availability_zones
  max_subnets            = length(local.availability_zones) * 2
}
