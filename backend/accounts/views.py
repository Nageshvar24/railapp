from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import generics,status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from .permissions import IsAdminRole
from .serializer import LoginSerializer,    RegisterSerializer
from django.db.models import Count, Q, Sum


User = get_user_model()

class RegisterView(generics.CreateAPIView):
    serializer_class =RegisterSerializer    
    permission_classes=[AllowAny]
    authentication_classes=[]

    def perform_create(self, serializer):
        serializer.save(role=User.Role.USER)

class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer

class LogoutView(APIView):
    permission_classes=[AllowAny]
    authentication_classes=[]

    def post(self,request):
        refresh = request.data.get("refresh")
        if not refresh:
            return Response({"details":"refresh token required"},status=status.HTTP_400_BAD_REQUEST)
        try:
            user_id=RefreshToken(refresh)["user_id"]
        except TokenError:
            return Response({"details":"invalid or expired token"},status=status.HTTP_401_UNAUTHORIZED)   
        updated =User.objects.filter(pk=user_id).update(last_logout=timezone.now())
        return Response({"details":"logged out", "update":updated},status=status.HTTP_200_OK) 

class MeView(APIView):
    def get(self,request):
        u=request.user
        return Response({"id": u.id,"username":u.username,"email":u.email,"fullName":u.full_name,"role":u.role}) 

class AdminPingView(APIView):
    permission_classes=[IsAdminRole]
    def get(self,request):
        return Response({"msg":f"hello admin{request.user.username}"})


# ADMIN: all registered users -> GET /api/auth/admin/users/?search=
class AdminUserListView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = User.objects.filter(role=User.Role.USER).annotate(
            confirmed_bookings=Count(
                "bookings", filter=Q(bookings__status="CONFIRMED"), distinct=True
            ),
            cancelled_bookings=Count(
                "bookings", filter=Q(bookings__status="CANCELLED"), distinct=True
            ),
            total_spent=Sum(
                "bookings__total_amount", filter=Q(bookings__status="CONFIRMED")
            ),
        ).order_by("-date_joined")

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(username__icontains=search)
                | Q(email__icontains=search)
                | Q(full_name__icontains=search)
            )

        results = [
            {
                "id": u.id,
                "username": u.username,
                "full_name": u.full_name,
                "email": u.email,
                "is_active": u.is_active,
                "date_joined": u.date_joined,
                "last_login": u.last_login,
                "confirmed_bookings": u.confirmed_bookings,
                "cancelled_bookings": u.cancelled_bookings,
                "total_spent": float(u.total_spent or 0),
            }
            for u in qs
        ]
        return Response({"total": len(results), "results": results})    




    
