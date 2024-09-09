variable environment {
  type        = string
  default     = "test"
  description = "description"
}

variable region_code {
  type        = string
  default     = "us-west-2"
  description = "description"
}

variable vpc_only_region {
  type        = bool
  default     = false
  description = "description"
}

variable availability_zones {
  type        = list(string)
  default     = []
  description = "description"
}
