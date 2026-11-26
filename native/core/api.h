#pragma once
#include <string>
namespace nd {
// The core's entry point for both builds: a JSON request {"op": …} → a JSON reply ({"error": …} on failure).
std::string call(const std::string& request);
}
