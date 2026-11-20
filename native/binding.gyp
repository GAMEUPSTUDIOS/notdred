# Native physics module for node-gyp, used to build it on Windows with Visual Studio's compiler (the Windows .exe
# workflow: node-gyp rebuild --directory native). Kept out of the project root so npm install never runs node-gyp.
# Linux and macOS keep using scripts/build-native.cjs (g++/clang). Same sources either way.
{
 "targets": [
  {
   "target_name": "freeport_physics",
   "sources": [
    "physics.cpp",
    "vendor/box2d-2.4.1/src/collision/b2_broad_phase.cpp",
    "vendor/box2d-2.4.1/src/collision/b2_chain_shape.cpp",
    "vendor/box2d-2.4.1/src/collision/b2_circle_shape.cpp",
    "vendor/box2d-2.4.1/src/collision/b2_collide_circle.cpp",
    "vendor/box2d-2.4.1/src/collision/b2_collide_edge.cpp",
    "vendor/box2d-2.4.1/src/collision/b2_collide_polygon.cpp",
    "vendor/box2d-2.4.1/src/collision/b2_collision.cpp",
    "vendor/box2d-2.4.1/src/collision/b2_distance.cpp",
    "vendor/box2d-2.4.1/src/collision/b2_dynamic_tree.cpp",
    "vendor/box2d-2.4.1/src/collision/b2_edge_shape.cpp",
    "vendor/box2d-2.4.1/src/collision/b2_polygon_shape.cpp",
    "vendor/box2d-2.4.1/src/collision/b2_time_of_impact.cpp",
    "vendor/box2d-2.4.1/src/common/b2_block_allocator.cpp",
    "vendor/box2d-2.4.1/src/common/b2_draw.cpp",
    "vendor/box2d-2.4.1/src/common/b2_math.cpp",
    "vendor/box2d-2.4.1/src/common/b2_settings.cpp",
    "vendor/box2d-2.4.1/src/common/b2_stack_allocator.cpp",
    "vendor/box2d-2.4.1/src/common/b2_timer.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_body.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_chain_circle_contact.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_chain_polygon_contact.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_circle_contact.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_contact.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_contact_manager.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_contact_solver.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_distance_joint.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_edge_circle_contact.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_edge_polygon_contact.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_fixture.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_friction_joint.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_gear_joint.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_island.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_joint.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_motor_joint.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_mouse_joint.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_polygon_circle_contact.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_polygon_contact.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_prismatic_joint.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_pulley_joint.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_revolute_joint.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_weld_joint.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_wheel_joint.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_world.cpp",
    "vendor/box2d-2.4.1/src/dynamics/b2_world_callbacks.cpp",
    "vendor/box2d-2.4.1/src/rope/b2_rope.cpp"
   ],
   "include_dirs": [
    "vendor",
    "vendor/box2d-2.4.1/include",
    "vendor/box2d-2.4.1/src"
   ],
   "cflags_cc": [
    "-std=c++17",
    "-fexceptions",
    "-O2"
   ],
   "cflags_cc!": [
    "-fno-exceptions"
   ],
   "defines": [
    "NAPI_VERSION=8"
   ],
   "msvs_settings": {
    "VCCLCompilerTool": {
     "ExceptionHandling": 1,
     "AdditionalOptions": [
      "/std:c++17",
      "/utf-8",
      "/bigobj"
     ],
     "Optimization": 2
    }
   },
   "xcode_settings": {
    "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
    "CLANG_CXX_LANGUAGE_STANDARD": "c++17"
   }
  }
 ]
}
