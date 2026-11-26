// JavaScript's Math functions, bit for bit as V8 12.4 (Node 22) computes them — see jsmath.cpp.
#pragma once
namespace nd {
namespace jsmath {
double acos(double x);
double acosh(double x);
double asin(double x);
double asinh(double x);
double atan(double x);
double atan2(double y, double x);
double cos(double x);
double exp(double x);
double atanh(double x);
double log(double x);
double log1p(double x);
double log2(double x);
double log10(double x);
double expm1(double x);
double cbrt(double x);
double sin(double x);
double tan(double x);
double cosh(double x);
double pow(double x, double y);
double sinh(double x);
double tanh(double x);
double hypot(double x, double y);
}  // namespace jsmath
}  // namespace nd
